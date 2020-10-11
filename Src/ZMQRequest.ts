import { Queue } from "typescript-collections";
import uniqid from "uniqid";
import * as zmq from "zeromq";
import Config from "./Config";
import {
    DEFAULT_ZMQ_REQUEST_ERROR_HANDLERS,
    TRequestHwmWarning,
    TZMQRequestErrorHandlers,
} from "./Errors";
import { CancellableDelay } from "./Utils/Delay";
import { RESPONSE_CACHE_EXPIRED } from "./ZMQResponse";

export type TRequestBody = [requesterId: string, nonce: string, message: string];
type TRequestResolver = (aResult: TRequestResponse) => void;

type TZmqSendRequest =
{
    Request: TRequestBody;
    Resolve: () => void;
};

export enum ERequestBody
{
    RequesterId,
    Nonce,
    Message,
}

export enum ERequestResponse
{
    SUCCESS = "SUCCESS",
    TIMEOUT = "TIMEOUT",
    CACHE_ERROR = "CACHE_ERROR",
}

export type TSuccessfulRequest =
{
    ResponseType: ERequestResponse.SUCCESS;
    Response: string;
};
export type TRequestTimeOut =
{
    ResponseType: ERequestResponse.TIMEOUT;
    MessageNonce: number;
    RequestBody: TRequestBody;
};
export type TResponseCacheError =
{
    ResponseType: ERequestResponse.CACHE_ERROR;
    Endpoint: string;
    MessageNonce: number;
};

export type TRequestResponse = TSuccessfulRequest | TRequestTimeOut | TResponseCacheError;

export class ZMQRequest
{
    private readonly mCancellableDelay: CancellableDelay = new CancellableDelay();
    private mDealer!: zmq.Dealer;
    private readonly mEndpoint: string;
    private readonly mErrorHandlers: TZMQRequestErrorHandlers;
    private readonly mOurUniqueId: string;
    private readonly mPendingRequests: Map<number, TRequestResolver> = new Map();
    private mRequestNonce: number = -1;
    private readonly mRoundTripMax: number;
    private mSafeToSend: boolean = true;
    private readonly mSendQueue: Queue<TZmqSendRequest> = new Queue();

    public constructor(aReceiverEndpoint: string, aErrorHandlers?: TZMQRequestErrorHandlers)
    {
        this.mRoundTripMax = Config.MaximumLatency * 2; // Send + response latency
        this.mEndpoint = aReceiverEndpoint;
        this.mErrorHandlers = aErrorHandlers ?? DEFAULT_ZMQ_REQUEST_ERROR_HANDLERS;
        this.mOurUniqueId = uniqid();

        this.Open();
    }

    private get ResponseTimeout(): number
    {
        return Config.HeartBeatInterval;
    }

    public get Endpoint(): string
    {
        return this.mEndpoint;
    }

    private AssertRequestProcessed(aRequestId: number, aRequest: TRequestBody): void
    {
        const lResolver: TRequestResolver | undefined = this.mPendingRequests.get(aRequestId);
        if (lResolver)
        {
            lResolver(
                {
                    ResponseType: ERequestResponse.TIMEOUT,
                    MessageNonce: aRequestId,
                    RequestBody: aRequest,
                },
            );
        }
    }

    private GenerateRequestResult(aMessage: string, aNonce: number): TRequestResponse
    {
        let lRequestResult: TRequestResponse;

        if (this.IsErrorMessage(aMessage))
        {
            lRequestResult =
            {
                ResponseType: ERequestResponse.CACHE_ERROR,
                Endpoint: this.mEndpoint,
                MessageNonce: Number(aNonce),
            };
        }
        else
        {
            lRequestResult =
            {
                ResponseType: ERequestResponse.SUCCESS,
                Response: aMessage.toString(),
            };
        }

        return lRequestResult;
    }

    private HandleZMQSendError(aError: any, aRequest: TRequestBody): void
    {
        if (aError && aError.code && aError.code === "EAGAIN")
        {
            const lHighWaterMarkWarning: TRequestHwmWarning =
            {
                Requester: aRequest[ERequestBody.RequesterId],
                Nonce: Number(aRequest[ERequestBody.Nonce]),
                Message: aRequest[ERequestBody.Message],
            };
            this.mErrorHandlers.HighWaterMarkWarning(lHighWaterMarkWarning);
        }
        else
        {
            throw aError;
        }
    }

    private IsErrorMessage(aMessage: string): boolean
    {
        return aMessage === RESPONSE_CACHE_EXPIRED;
    }

    private async ManageRequest(aRequestId: number, aRequest: TRequestBody): Promise<void>
    {
        const lMaximumSendTime: number = Date.now() + this.mRoundTripMax;
        await this.mCancellableDelay.Create(this.ResponseTimeout);

        while (this.mPendingRequests.has(aRequestId) && Date.now() < lMaximumSendTime)
        {
            await this.QueueSend(aRequest);
            await this.mCancellableDelay.Create(this.ResponseTimeout);
        }

        this.AssertRequestProcessed(aRequestId, aRequest);
    }

    private Open(): void
    {
        this.mDealer = new zmq.Dealer;
        this.mDealer.sendTimeout = 0;
        this.mDealer.connect(this.mEndpoint);

        this.ResponseHandler();
    }

    private async ProcessSend(): Promise<void>
    {
        const lNextSend: TZmqSendRequest | undefined = this.mSendQueue.peek();

        if (lNextSend && this.mSafeToSend)
        {
            this.mSafeToSend = false;
            this.mSendQueue.dequeue();

            try
            {
                await this.mDealer.send(lNextSend.Request);
            }
            catch (aError)
            {
                this.HandleZMQSendError(aError, lNextSend.Request);
            }

            lNextSend.Resolve();
            this.mSafeToSend = true;

            this.ProcessSend();
        }
    }

    private ProcessZmqReceive(nonce: Buffer, msg: Buffer): void
    {
        const lRequestNonce: number = Number(nonce.toString());
        const lMessage: string = msg.toString();

        const lMessageCaller: TRequestResolver | undefined = this.mPendingRequests.get(lRequestNonce);

        if (lMessageCaller)
        {
            lMessageCaller(this.GenerateRequestResult(lMessage, lRequestNonce));
            this.mPendingRequests.delete(lRequestNonce);
        }
    }

    private QueueSend(aRequest: TRequestBody): Promise<void>
    {
        let lResolver: () => void;

        const lPromise: Promise<void> = new Promise<void>((aResolve: () => void): void =>
        {
            lResolver = aResolve;
        });

        this.mSendQueue.enqueue(
            {
                Request: aRequest,
                Resolve: lResolver!,
            },
        );
        this.ProcessSend();

        return lPromise;
    }

    private async ResponseHandler(): Promise<void>
    {
        for await (const [nonce, msg] of this.mDealer)
        {
            if (this.mDealer)
            {
                this.ProcessZmqReceive(nonce, msg);
            }
        }
    }

    private async SendRequest(aRequest: TRequestBody): Promise<TRequestResponse>
    {
        const lRequestId: number = Number(aRequest[ERequestBody.Nonce]);

        await this.QueueSend(aRequest);   // Can potentially move this inside of ManageRequest loop
        this.ManageRequest(lRequestId, aRequest);

        return new Promise<TRequestResponse>((aResolve: TRequestResolver): void =>
        {
            this.mPendingRequests.set(lRequestId, aResolve);
        });
    }

    public Close(): void
    {
        this.mDealer.linger = 0;
        this.mDealer.close();
        this.mDealer = undefined!;

        this.mCancellableDelay.Clear();
    }

    public async Send(aData: string): Promise<TRequestResponse>
    {
        const lRequestId: number = ++this.mRequestNonce;
        const lRequest: TRequestBody =
        [
            this.mOurUniqueId,
            lRequestId.toString(),
            aData,
        ];

        return this.SendRequest(lRequest);
    }
}

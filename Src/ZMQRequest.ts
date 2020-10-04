import { Queue } from "typescript-collections";
import uniqid from "uniqid";
import * as zmq from "zeromq";
import Config from "./Config";
import { DEFAULT_ZMQ_REQUEST_ERROR_HANDLERS, TZMQRequestErrorHandlers } from "./Errors";
import { CancellableDelay } from "./Utils/Delay";
import { RESPONSE_CACHE_EXPIRED } from "./ZMQResponse";

const RESPONSE_TIMEOUT: number = 500;   // 500ms   (this includes computation time on the sync wrapped services)

type TResolve = (aResult: TRequestResponse) => void;

type TSendRequest =
{
    Request: TRequestBody;
    Resolve: () => void;
};

type TRequestBody = [requesterId: string, nonce: string, message: string];
export enum ERequestBody
{
    RequesterId,
    Nonce,
    Message,
}

export type TRequestResponse = string | TRequestTimeOut;

export type TRequestTimeOut =
{
    RequestId: number;
    RequestBody: TRequestBody;
};

export class ZMQRequest
{
    private readonly mCancellableDelay: CancellableDelay = new CancellableDelay();
    private mDealer!: zmq.Dealer;
    private readonly mEndpoint: string;
    private readonly mErrorHandlers: TZMQRequestErrorHandlers;
    private readonly mOurUniqueId: string;
    private readonly mPendingRequests: Map<number, TResolve> = new Map();
    private mRequestNonce: number = 0;
    private readonly mRoundTripMax: number;
    private readonly mSendQueue: Queue<TSendRequest> = new Queue();

    public constructor(aReceiverEndpoint: string, aErrorHandlers?: TZMQRequestErrorHandlers)
    {
        this.mRoundTripMax = Config.MaximumLatency * 2; // Send + response latency
        this.mEndpoint = aReceiverEndpoint;
        this.mErrorHandlers = aErrorHandlers ?? DEFAULT_ZMQ_REQUEST_ERROR_HANDLERS;
        this.mOurUniqueId = uniqid();

        this.Open();
    }

    public get Endpoint(): string
    {
        return this.mEndpoint;
    }

    private AssertRequestProcessed(aRequestId: number, aRequest: TRequestBody): void
    {
        const lResolver: TResolve | undefined = this.mPendingRequests.get(aRequestId);  // TODO: Review why this is called assert when it doesnt assert
        if (lResolver)
        {
            lResolver(
                {
                    RequestId: aRequestId,
                    RequestBody: aRequest,
                },
            );
        }
    }

    private IsErrorMessage(aMessage: string): boolean
    {
        return aMessage === RESPONSE_CACHE_EXPIRED;
    }

    private async ManageRequest(aRequestId: number, aRequest: TRequestBody): Promise<void>
    {
        const lMaximumSendTime: number = Date.now() + this.mRoundTripMax;
        await this.mCancellableDelay.Create(RESPONSE_TIMEOUT);

        while (this.mPendingRequests.has(aRequestId) && Date.now() < lMaximumSendTime)
        {
            await this.SendMessage(aRequest);
            await this.mCancellableDelay.Create(RESPONSE_TIMEOUT);
        }

        this.AssertRequestProcessed(aRequestId, aRequest);
    }

    private Open(): void
    {
        this.mDealer = new zmq.Dealer;
        this.mDealer.connect(this.mEndpoint);
        this.PollZmqReceive();
    }

    private PollZmqReceive(): void
    {
        this.mDealer.receive()
            .then((aBuffers: Buffer[]) =>
            {
                const [nonce, msg] = aBuffers;
                this.ProcessZmqMessage(nonce, msg);

                this.PollZmqReceive();
            })
            .catch((aReason: any) =>
            {
                if (this.mDealer)
                {
                    throw aReason;
                }
            });
    }

    private async ProcessSend(): Promise<void>
    {
        const lNextSend: TSendRequest | undefined = this.mSendQueue.dequeue();  // Don't we only want one send at a time?

        if (lNextSend)
        {
            await this.mDealer.send(lNextSend.Request);
            lNextSend.Resolve();

            this.ProcessSend();
        }
    }

    private ProcessZmqMessage(nonce: Buffer, msg: Buffer): void
    {
        const lRequestNonce: number = Number(nonce.toString());
        const lMessage: string = msg.toString();

        const lMessageCaller: TResolve | undefined = this.mPendingRequests.get(lRequestNonce);

        if (this.IsErrorMessage(lMessage))
        {
            this.mErrorHandlers.CacheError({
                Endpoint: this.mEndpoint,
                MessageNonce: Number(nonce),
            });
        }
        else if (lMessageCaller)
        {
            lMessageCaller(msg.toString());
            this.mPendingRequests.delete(lRequestNonce);
        }
    }

    private SendMessage(aRequest: TRequestBody): Promise<void>
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

    private async SendRequest(aRequest: TRequestBody): Promise<TRequestResponse>
    {
        const lRequestId: number = Number(aRequest[ERequestBody.Nonce]);

        await this.SendMessage(aRequest);   // Can potentially move this inside of ManageRequest loop
        this.ManageRequest(lRequestId, aRequest);

        return new Promise<TRequestResponse>((aResolve: TResolve): void =>
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
        // TODO: Build a way to safely send multiple requests without creating a backlog
        const lRequestId: number = this.mRequestNonce++;
        const lRequest: TRequestBody =
        [
            this.mOurUniqueId,
            lRequestId.toString(),
            aData,
        ];

        return this.SendRequest(lRequest);
    }
}

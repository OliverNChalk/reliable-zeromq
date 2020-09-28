import { Queue } from "typescript-collections";
import uniqid from "uniqid";
import * as zmq from "zeromq";
import Config from "./Config";
import { CancellableDelay, ICancellableDelay } from "./Utils/Delay";
import { GenerateMessage } from "./Utils/GenerateMessage";

const RESPONSE_TIMEOUT: number = 500;   // 500ms   (this includes computation time on the wrapped service)

type TResolve = (aResult: TRequestResponse) => void;

type TSendRequest =
{
    Request: TRequestBody | TRegistrationBody;
    Resolve: () => void;
};

type TRegistrationBody = [requesterId: string, nonce: "-1"];
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
    Request: string[];
};

type TPendingRequest =
{
    Resolve: TResolve;
    Acknowledged: boolean;
};

export class ZMQRequest
{
    private mDealer!: zmq.Dealer;
    private readonly mEndpoint: string;
    private readonly mOurUniqueId: string;
    private mPendingDelays: Map<number, ICancellableDelay> = new Map();
    private mPendingRequests: Map<number, TPendingRequest> = new Map();
    private mRequestNonce: number = 0;
    private readonly mRoundTripMax: number;

    // Message queueing
    private mSendQueue: Queue<TSendRequest> = new Queue();

    public constructor(aReceiverEndpoint: string)
    {
        this.mRoundTripMax = Config.MaximumLatency * 2; // Send + response latency
        this.mEndpoint = aReceiverEndpoint;
        this.mOurUniqueId = uniqid();

        this.Open();
    }

    public get Endpoint(): string
    {
        return this.mEndpoint;
    }

    private AcknowledgeResponse(aNonce: Buffer): void
    {
        const lRequest: TRequestBody =
        [
            this.mOurUniqueId,
            aNonce.toString(),
            GenerateMessage.Ack(this.mOurUniqueId, aNonce),
        ];
        this.mDealer.send(lRequest);    // TODO: This bypasses our internal queueing system, which incidentally needs review
    }

    private AssertRequestProcessed(aRequestId: number, aRequest: string[]): void
    {
        const lRequest: TPendingRequest | undefined = this.mPendingRequests.get(aRequestId);
        if (this.RequestNotAcknowledged(aRequestId))
        {
            // Return a TRequestTimeout object
            lRequest!.Resolve(
                {
                    RequestId: aRequestId,
                    Request: aRequest,
                },
            );
        }
    }

    private async ManageRequest(aRequestId: number, aRequest: TRequestBody): Promise<void>
    {
        const lMaximumSendTime: number = Date.now() + this.mRoundTripMax;
        await this.WaitResponseTimeout(aRequestId);

        while (this.RequestNotAcknowledged(aRequestId) && Date.now() < lMaximumSendTime)
        {
            await this.SendMessage(aRequest);
            await this.WaitResponseTimeout(aRequestId);
        }

        this.AssertRequestProcessed(aRequestId, aRequest);
    }

    private Open(): void
    {
        this.mDealer = new zmq.Dealer;
        this.mDealer.connect(this.mEndpoint);
        this.ResponseHandler();

        this.mPendingRequests.set(-1, { Resolve: (): void => console.log("REGISTERED"), Acknowledged: false });
        this.SendMessage([this.mOurUniqueId, "-1"]);
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

    private RequestNotAcknowledged(aRequestId: number): boolean
    {
        return  this.mPendingRequests.has(aRequestId)
            && !this.mPendingRequests.get(aRequestId)!.Acknowledged;
    }

    private async ResponseHandler(): Promise<void>
    {
        for await (const [nonce, msg] of this.mDealer)
        {
            // Forward requests to the registered handler
            const lRequestId: number = Number(nonce.toString());
            const lPendingRequest: TPendingRequest | undefined = this.mPendingRequests.get(lRequestId);

            if (lPendingRequest)
            {
                if (msg)
                {
                    lPendingRequest.Resolve(msg.toString());
                    this.mPendingRequests.delete(lRequestId);
                }
                else
                {
                    lPendingRequest.Acknowledged = true;
                    this.AcknowledgeResponse(nonce);
                }
            }
        }
    }

    private SendMessage(aRequest: TRequestBody | TRegistrationBody): Promise<void>
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

    private async WaitResponseTimeout(aRequestId: number): Promise<void>
    {
        const lDelay: ICancellableDelay = CancellableDelay(RESPONSE_TIMEOUT);
        this.mPendingDelays.set(aRequestId, lDelay);

        await lDelay;

        this.mPendingDelays.delete(aRequestId);
    }

    public Close(): void
    {
        this.mDealer.linger = 0;
        this.mDealer.close();
        this.mDealer = undefined!;

        this.mPendingDelays.forEach((aDelay: ICancellableDelay) =>
        {
            aDelay.Resolve();
        });
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

        await this.SendMessage(lRequest);   // Can potentially move this inside of ManageRequest loop
        this.ManageRequest(lRequestId, lRequest);

        return new Promise<TRequestResponse>((aResolve: TResolve): void =>
        {
            this.mPendingRequests.set(
                lRequestId,
                {
                    Resolve: aResolve,
                    Acknowledged: false,
                },
            );
        });
    }
}

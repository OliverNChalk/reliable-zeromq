import { Queue } from "typescript-collections";
import uniqid from "uniqid";
import * as zmq from "zeromq";
import Config from "./Config";
import { CancellableDelay, ICancellableDelay } from "./Utils/Delay";

const RESPONSE_TIMEOUT: number = 500;   // 500ms   (this includes computation time on the wrapped service)

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
    Request: string[];
};

export class ZMQRequest
{
    private mDealer!: zmq.Dealer;
    private readonly mEndpoint: string;
    private readonly mOurUniqueId: string;
    private mPendingDelays: Map<number, ICancellableDelay> = new Map();
    private mPendingRequests: Map<number, TResolve> = new Map();
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

    private AssertRequestProcessed(aRequestId: number, aRequest: string[]): void
    {
        const lResolver: TResolve | undefined = this.mPendingRequests.get(aRequestId);  // TODO: Review why this is called assert when it doesnt assert
        if (lResolver)
        {
            lResolver(
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

        while (this.mPendingRequests.has(aRequestId) && Date.now() < lMaximumSendTime)
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

    private async ResponseHandler(): Promise<void>
    {
        for await (const [nonce, msg] of this.mDealer)
        {
            // Forward requests to the registered handler
            const lRequestId: number = Number(nonce.toString());
            const lMessageCaller: TResolve | undefined = this.mPendingRequests.get(lRequestId);

            if (lMessageCaller)
            {
                lMessageCaller(msg.toString());
                this.mPendingRequests.delete(lRequestId);
            }
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
            this.mPendingRequests.set(lRequestId, aResolve);
        });
    }
}

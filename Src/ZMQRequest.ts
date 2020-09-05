import { Queue } from "typescript-collections";
import uniqid from "uniqid";
import * as zmq from "zeromq";
import Config from "./Config";
import { Delay } from "./Utils/Delay";

const RESPONSE_TIMEOUT: number = 500;   // 500ms   (this includes computation time on the wrapped service)

type TResolve = (aResult: string) => void;
type TReject = (aReason: any) => void;
type TResolveReject =
{
    Resolve: TResolve;
    Reject: TReject;
};

type TSendRequest =
{
    Request: string[];
    Resolve: () => void;
};

export enum ERequestBody
{
    RequesterId,
    Nonce,
    Message,
}

export type TZMQRequestErrorHandlers =
{
    RequestTimeOut?: (aRequestId: number, aRequest: string[]) => void;
};

export class ZMQRequest
{
    private readonly mEndpoint: string;
    private readonly mErrorHandlers: TZMQRequestErrorHandlers;
    private readonly mOurUniqueId: string;
    private readonly mRoundTripMax: number;
    private mDealer!: zmq.Dealer;
    private mPendingRequests: Map<number, TResolveReject> = new Map();
    private mRequestNonce: number = 0;

    // Message queueing
    private mSendQueue: Queue<TSendRequest> = new Queue();

    public constructor(aReceiverEndpoint: string, aErrorHandlers: TZMQRequestErrorHandlers = {})
    {
        this.mRoundTripMax = Config.MaximumLatency * 2; // Send + response latency
        this.mEndpoint = aReceiverEndpoint;
        this.mOurUniqueId = uniqid();
        this.mErrorHandlers = aErrorHandlers;
    }

    public get Endpoint(): string
    {
        return this.mEndpoint;
    }

    private AssertRequestProcessed(aRequestId: number, aRequest: string[]): void
    {
        const lResolver: TResolveReject | undefined = this.mPendingRequests.get(aRequestId);
        if (lResolver && this.mErrorHandlers.RequestTimeOut)
        {
            this.mErrorHandlers.RequestTimeOut(aRequestId, aRequest);
        }
    }

    private async ManageRequest(aRequestId: number, aRequest: string[]): Promise<void>
    {
        const lMaximumSendTime: number = Date.now() + this.mRoundTripMax;
        await Delay(RESPONSE_TIMEOUT);

        while (this.mPendingRequests.has(aRequestId) && Date.now() < lMaximumSendTime)
        {
            await this.SendMessage(aRequest);
            await Delay(RESPONSE_TIMEOUT);
        }

        this.AssertRequestProcessed(aRequestId, aRequest);
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
            const lMessageCaller: TResolveReject | undefined = this.mPendingRequests.get(lRequestId);

            if (lMessageCaller)
            {
                lMessageCaller.Resolve(msg.toString());
                this.mPendingRequests.delete(lRequestId);
            }
        }
    }

    private SendMessage(aRequest: string[]): Promise<void>
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

    public async Send(aData: string): Promise<string>
    {
        // TODO: Build a way to safely send multiple requests without creating a backlog
        if (!this.mDealer)
        {
            throw new Error("Attempted to send while stopped");
        }

        const lRequestId: number = this.mRequestNonce++;

        const lRequest: string[] =
        [
            this.mOurUniqueId,
            lRequestId.toString(),
            aData,
        ];
        await this.SendMessage(lRequest);   // Can potentially move this inside of ManageRequest loop

        this.ManageRequest(lRequestId, lRequest);

        return new Promise<string>((aResolve: TResolve, aReject: TReject): void =>
        {
            this.mPendingRequests.set(lRequestId, { Resolve: aResolve, Reject: aReject });
        });
    }

    public Start(): void
    {
        this.mDealer = new zmq.Dealer;
        this.mDealer.connect(this.mEndpoint);
        this.ResponseHandler();
    }

    public Stop(): void
    {
        this.mDealer.linger = 0;
        this.mDealer.close();
        delete (this.mDealer);
    }
}

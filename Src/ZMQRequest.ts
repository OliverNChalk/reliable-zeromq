import { Queue } from "typescript-collections";
import * as zmq from "zeromq";
import { MAXIMUM_LATENCY } from "./Constants";
import { Delay } from "./Utils/Delay";
import JSONBigInt from "./Utils/JSONBigInt";

const RESPONSE_TIMEOUT: number = 500;   // 500ms   (this includes computation time on the wrapped service)
const ROUND_TRIP_MAX_TIME: number = 2 * MAXIMUM_LATENCY;
const MAX_TIME_ERROR: string = "MAX ROUND TRIP TIME BREACHED, STOPPING";

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

export class ZMQRequest
{
    private mDealer!: zmq.Dealer;
    private readonly mEndpoint: string;
    private mPendingRequests: Map<number, TResolveReject> = new Map();
    private mRequestNonce: number = 0;

    // Message queueing
    private mSendQueue: Queue<TSendRequest> = new Queue();

    public constructor(aReceiverEndpoint: string)
    {
        this.mEndpoint = aReceiverEndpoint;
    }

    private async ManageRequest(aRequestId: number, aRequest: string[]): Promise<void>
    {
        const lMaximumSendTime: number = Date.now() + ROUND_TRIP_MAX_TIME;

        await Delay(RESPONSE_TIMEOUT);
        while (this.mPendingRequests.has(aRequestId) && Date.now() < lMaximumSendTime)
        {
            await this.SendMessage(aRequest);
            await Delay(RESPONSE_TIMEOUT);
        }

        const lResolver: TResolveReject | undefined = this.mPendingRequests.get(aRequestId);
        if (lResolver)
        {
            // TODO: Error via EventEmitter
            lResolver.Reject(new Error(MAX_TIME_ERROR));
            this.Stop();
        }
    }

    private async ProcessSend(): Promise<void>
    {
        const lNextSend: TSendRequest | undefined = this.mSendQueue.dequeue();

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

        const lRequestId: number = this.mRequestNonce;

        const lRequest: string[] =
        [
            JSONBigInt.Stringify(lRequestId),
            aData,
        ];
        await this.SendMessage(lRequest);

        this.ManageRequest(lRequestId, lRequest);
        ++this.mRequestNonce;

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

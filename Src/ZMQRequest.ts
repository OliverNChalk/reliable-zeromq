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

export class ZMQRequest
{
    private mDealer!: zmq.Dealer;
    private readonly mEndpoint: string;
    private mPendingRequests: Map<number, TResolveReject> = new Map();
    private mRequestNonce: number = 0;

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
            await this.mDealer.send(aRequest);
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

    public async Send(aData: string): Promise<string>
    {
        const lRequestId: number = this.mRequestNonce;

        const lRequest: string[] =
        [
            JSONBigInt.Stringify(lRequestId),
            aData,
        ];
        await this.mDealer.send(lRequest);
        ++this.mRequestNonce;

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

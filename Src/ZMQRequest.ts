import * as zmq from "zeromq";
import { MAXIMUM_LATENCY } from "./Constants";
import { Delay } from "./Utils/Delay";

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
    private mPendingRequests: Map<string, TResolveReject> = new Map();
    private mRequestNonce: bigint = 0n;

    public constructor(aReceiverEndpoint: string)
    {
        this.mEndpoint = aReceiverEndpoint;
    }

    private async ManageRequest(aRequestId: string, aRequest: string[]): Promise<void>
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
            const lMessageCaller: TResolveReject | undefined = this.mPendingRequests.get(nonce.toString());

            if (lMessageCaller)
            {
                lMessageCaller.Resolve(msg.toString());
                this.mPendingRequests.delete(nonce.toString());
            }
        }
    }

    public async Send(aData: string): Promise<string>
    {
        const lRequestId: string = (++this.mRequestNonce).toString();

        const lRequest: string[] =
        [
            this.mRequestNonce.toString(),
            aData,
        ];
        await this.mDealer.send(lRequest);

        this.ManageRequest(lRequestId, lRequest);

        return new Promise<string>((aResolve: TResolve, aReject: TReject): void =>
        {
            this.mPendingRequests.set(lRequestId, { Resolve: aResolve, Reject: aReject });
        });
    }

    public Start(): void
    {
        this.mRequestNonce = 0n;
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

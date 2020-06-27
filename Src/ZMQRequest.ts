import * as zmq from "zeromq";
import { MAXIMUM_LATENCY } from "./Constants";
import { Delay } from "./Utils/Delay";

const RESPONSE_TIMEOUT: number = 500;   // 500ms   (this includes computation time on the wrapped service)
const ROUND_TRIP_MAX_TIME: number = 2 * MAXIMUM_LATENCY;

export class ZMQRequest
{

    private mDealer!: zmq.Dealer;
    private readonly mEndpoint: string;
    private mPendingRequests: Map<string, (aResponse: string) => void> = new Map();
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

        if (this.mPendingRequests.has(aRequestId))
        {
            throw new Error(`Failed to process ${aRequestId} in ${ROUND_TRIP_MAX_TIME}ms`);
        }
    }

    private async ResponseHandler(): Promise<void>
    {
        for await (const [nonce, msg] of this.mDealer)
        {
            // Forward requests to the registered handler
            const lMessageCaller: ((aResponse: string) => void) | undefined
                = this.mPendingRequests.get(nonce.toString());

            if (lMessageCaller)
            {
                lMessageCaller(msg.toString());
            }
            else
            {
                console.error({
                    error: "NO REGISTERED CALLBACK",
                    nonce: nonce,
                    msg: msg,
                });
            }

            this.mPendingRequests.delete(nonce.toString());
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

        return new Promise<string>((aResolve: (aResponse: string) => void): void =>
        {
            this.mPendingRequests.set(lRequestId, aResolve);
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

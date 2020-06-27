import * as zmq from "zeromq";
import { MAXIMUM_LATENCY } from "./Constants";
import ExpiryMap from "./Utils/ExpiryMap";

const REQUEST_EXPIRY: number = 3 * MAXIMUM_LATENCY;   // 1 Minute

export class ZMQResponse
{
    private mRouter!: zmq.Router;
    private readonly mEndpoint: string;
    private readonly mRequestHandler: (aRequest: string) => Promise<string>;
    private readonly mCachedRequests: ExpiryMap<string, string> = new ExpiryMap(REQUEST_EXPIRY);

    public constructor(aReplierEndpoint: string, aReceiver: (aRequest: string) => Promise<string>)
    {
        this.mEndpoint = aReplierEndpoint;
        this.mRequestHandler = aReceiver;
    }

    private async ReceiveLoop(): Promise<void>
    {
        for await (const [sender, nonce, msg] of this.mRouter)
        {
            // Forward requests to the registered handler
            const lMessageId: string = sender.toString() + nonce.toString();
            const lResponse: string | undefined = this.mCachedRequests.get(lMessageId);

            let lPromise: Promise<string>;

            if (!lResponse)
            {
                lPromise = this.mRequestHandler(msg.toString());
            }
            else
            {
                lPromise = undefined!;
            }

            lPromise.then((aResponse: string): void =>
            {
                this.mCachedRequests.set(lMessageId, aResponse);
                this.mRouter.send([sender, nonce, aResponse]);  // Delimiter not necessary when talk to dealer
            });
        }
    }

    public async Start(): Promise<void>
    {
        this.mRouter = new zmq.Router();
        await this.mRouter.bind(this.mEndpoint);

        this.ReceiveLoop();
    }

    public Stop(): void
    {
        this.mRouter.linger = 0;
        this.mRouter.close();
        delete(this.mRouter);
    }
}

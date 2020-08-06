import * as zmq from "zeromq";
import { MAXIMUM_LATENCY } from "./Constants";
import ExpiryMap from "./Utils/ExpiryMap";

const REQUEST_EXPIRY: number = 3 * MAXIMUM_LATENCY;   // 1 Minute

export class ZMQResponse
{
    private mRouter!: zmq.Router;
    private readonly mEndpoint: string;
    private readonly mRequestHandler: (aRequest: string) => Promise<string>;
    private readonly mCachedRequests: ExpiryMap<string, string | Promise<string>> = new ExpiryMap(REQUEST_EXPIRY);

    public constructor(aReplierEndpoint: string, aReceiver: (aRequest: string) => Promise<string>)
    {
        this.mEndpoint = aReplierEndpoint;
        this.mRequestHandler = aReceiver;
    }

    private async ReceiveLoop(): Promise<void>
    {
        for await (const [sender, sender_uid, nonce, msg] of this.mRouter)
        {
            // Forward requests to the registered handler
            const lMessageId: string = sender_uid.toString() + nonce.toString();
            const lResponse: string | Promise<string> | undefined = this.mCachedRequests.get(lMessageId);

            let lPromise: Promise<string>;

            if (!lResponse)
            {
                lPromise = this.mRequestHandler(msg.toString());
                this.mCachedRequests.set(lMessageId, lPromise);

                lPromise.then((aResponse: string): void =>
                {
                    this.mCachedRequests.set(lMessageId, aResponse);
                });
            }
            else
            {
                lPromise = Promise.resolve(lResponse);
            }

            lPromise.then((aResponse: string): void =>
            {
                this.mRouter.send([sender, nonce, aResponse]);
            });
        }
    }

    public get Endpoint(): string
    {
        return this.mEndpoint;
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

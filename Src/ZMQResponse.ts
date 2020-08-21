import * as zmq from "zeromq";
import Config from "./Config";
import ExpiryMap from "./Utils/ExpiryMap";

export class ZMQResponse
{
    private mRouter!: zmq.Router;
    private readonly mEndpoint: string;
    private readonly mRequestHandler: (aRequest: string) => Promise<string>;
    private readonly mCachedRequests: ExpiryMap<string, string | Promise<string>>;

    public constructor(aReplierEndpoint: string, aReceiver: (aRequest: string) => Promise<string>)
    {
        this.mCachedRequests = new ExpiryMap(3 * Config.MaximumLatency);    // 3 times latency assumption, this is a bit arbitrary
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
                this.mCachedRequests.set(lMessageId, lPromise); // TODO: Timer starts from when promise is inserted, this will cause issues if we move to an req, ack, rep model

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

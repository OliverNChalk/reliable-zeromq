import * as zmq from "zeromq";
import Config from "./Config";
import ExpiryMap from "./Utils/ExpiryMap";
import { NonceMap } from "./Utils/NonceMap";

export const RESPONSE_CACHE_EXPIRED: string = "ZMQ_RESPONSE ERROR: MESSAGE NOT IN CACHE";

export class ZMQResponse
{
    private readonly mCachedRequests: ExpiryMap<string, string | Promise<string>>;
    private readonly mEndpoint: string;
    private readonly mRequestHandler: (aRequest: string) => Promise<string>;
    private readonly mSeenMessages: Map<string, NonceMap> = new Map();
    private mRouter!: zmq.Router;

    public constructor(aReplierEndpoint: string, aReceiver: (aRequest: string) => Promise<string>)
    {
        this.mCachedRequests = new ExpiryMap(3 * Config.MaximumLatency);    // 3 times latency assumption, this is a bit arbitrary
        this.mEndpoint = aReplierEndpoint;
        this.mRequestHandler = aReceiver;

        this.Open();
    }

    public get Endpoint(): string
    {
        return this.mEndpoint;
    }

    private HandleDuplicateRequest(sender_uid: Buffer, nonce: Buffer, routing_id: Buffer): void
    {
        const lMessageId: string = sender_uid.toString() + nonce.toString();
        const lCachedResponse: string | Promise<string> = this.mCachedRequests.get(lMessageId)!;    // ASSUMES: lCachedResponse null check has already been performed

        if (typeof lCachedResponse === "string")
        {
            this.mRouter.send([routing_id, nonce, lCachedResponse]);    // TODO: Build queueing mechanism as overflow for HWM, add alerting if overflow builds
        }
    }

    private HandleNewRequest(sender_uid: Buffer, nonce: Buffer, msg: Buffer, routing_id: Buffer): void
    {
        const lMessageId: string = sender_uid.toString() + nonce.toString();

        const lPromise: Promise<string> = this.mRequestHandler(msg.toString());
        this.mCachedRequests.set(lMessageId, lPromise); // TODO: Timer starts from when promise is inserted, this will cause issues if we move to an req, ack, rep model

        lPromise.then((aResponse: string): void =>      // TODO: Review performance if we use a non-blocking await lPromise (would need to wrap in its own async method)
        {
            this.mCachedRequests.set(lMessageId, aResponse);
            this.mRouter.send([routing_id, nonce, aResponse]);
        });
    }

    private HandleRequest(sender_uid: Buffer, nonce: Buffer, msg: Buffer, routing_id: Buffer): void
    {
        const lSenderUID: string = sender_uid.toString();
        const lNonce: number = Number(nonce.toString());

        if (this.UnseenRequest(lSenderUID, lNonce))
        {
            this.UpdateSeenMessages(lSenderUID, lNonce);
            this.HandleNewRequest(sender_uid, nonce, msg, routing_id);
        }
        else if (this.RequestInCache(lSenderUID, lNonce))
        {
            this.HandleDuplicateRequest(sender_uid, nonce, routing_id);
        }
        else
        {
            this.mRouter.send([routing_id, nonce, RESPONSE_CACHE_EXPIRED]);
        }
    }

    private InitRequesterIfEmpty(aSenderUID: string): void
    {
        if (!this.mSeenMessages.has(aSenderUID))
        {
            this.mSeenMessages.set(aSenderUID, new NonceMap());
        }
    }

    private Open(): void
    {
        this.mRouter = new zmq.Router();
        this.mRouter.bind(this.mEndpoint)
            .then(() =>
            {
                this.PollZmqReceive();
            });
    }

    private PollZmqReceive(): void
    {
        this.mRouter.receive()
            .then((aBuffers: Buffer[]) =>
            {
                if (this.mRouter)
                {
                    const [routing_id, sender_uid, nonce, msg] = aBuffers;
                    const lSenderUID: string = sender_uid.toString();

                    this.InitRequesterIfEmpty(lSenderUID);
                    this.HandleRequest(sender_uid, nonce, msg, routing_id);

                    this.PollZmqReceive();
                }
            })
            .catch((aReason: any) =>
            {
                if (this.mRouter)
                {
                    throw aReason;
                }
            });
    }

    private RequestInCache(aSenderUID: string, aNonce: number): boolean
    {
        const lMessageId: string = aSenderUID + aNonce.toString();

        return this.mCachedRequests.has(lMessageId);
    }

    private UnseenRequest(aSenderUID: string, aNonce: number): boolean
    {
        return !this.mSeenMessages.get(aSenderUID)!.Has(aNonce);
    }

    private UpdateSeenMessages(aSenderUID: string, aNewNonce: number): void
    {
        const lNonces: NonceMap = this.mSeenMessages.get(aSenderUID)!;
        lNonces.Insert(aNewNonce);
        lNonces.GarbageClean();
    }

    public Close(): void
    {
        this.mCachedRequests.clear();
        this.mSeenMessages.clear();

        this.mRouter.linger = 0;
        this.mRouter.close();
        this.mRouter = undefined!;
    }
}

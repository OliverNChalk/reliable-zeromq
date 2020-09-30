import * as zmq from "zeromq";
import Config from "./Config";
import ExpiryMap from "./Utils/ExpiryMap";

type TRequesterEntry =
{
    HighestConsecutiveNonce: number;
    SeenNonces: Map<number, boolean>;   // TODO: Replace with an array with index 0 === LowestUnseenNonce, array size = LatestNonce - LowestUnseenNonce
};

export class ZMQResponse
{
    private readonly mCachedRequests: ExpiryMap<string, string | Promise<string>>;
    private readonly mEndpoint: string;
    private readonly mRequestHandler: (aRequest: string) => Promise<string>;
    private readonly mSeenMessages: Map<string, TRequesterEntry> = new Map();
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

    private GarbageCleanSeenNonces(aRequesterEntry: TRequesterEntry): void
    {
        // Garbage clean from LowestUnseenNonce + 1 until gap detected
        const lSortedEntries: [number, boolean][] = Array.from(aRequesterEntry.SeenNonces).sort();

        let lPreviousNonce: number = aRequesterEntry.HighestConsecutiveNonce;
        lSortedEntries.forEach((aEntry: [number, boolean]) =>
        {
            // Walk through seen nonces until gap detected
            const lSeenNonce: number = aEntry[0];
            if (lSeenNonce === lPreviousNonce + 1)
            {
                aRequesterEntry.SeenNonces.delete(lSeenNonce);
                lPreviousNonce++;
            }
        });

        aRequesterEntry.HighestConsecutiveNonce = lPreviousNonce;
    }

    private HandleDuplicateRequest(sender_uid: Buffer, nonce: Buffer, msg: Buffer, routing_id: Buffer): void
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

    private HandleOpening(aSenderId: string): void
    {
        // Register the new sender
        this.mSeenMessages.set(aSenderId, { HighestConsecutiveNonce: -1, SeenNonces: new Map() });
    }

    private HandleRequest(sender_uid: Buffer, nonce: Buffer, msg: Buffer, routing_id: Buffer): void
    {
        const lSenderUID: string = sender_uid.toString();
        const lNonce: number = Number(nonce.toString());
        if (this.UnseenRequest(lSenderUID, lNonce))
        {
            //  CALL HANDLER
            //  RESPOND HANDLER_RESULT
            this.UpdateSeenMessages(lSenderUID, lNonce);
            this.HandleNewRequest(sender_uid, nonce, msg, routing_id);
        }
        else if (this.RequestInCache(lSenderUID, lNonce))
        {
            //  RESPOND CACHE_RESULT
            this.HandleDuplicateRequest(sender_uid, nonce, msg, routing_id);
        }
        else
        {
            // TODO: RESPOND CACHE_EXPIRED_ERROR
            throw new Error("CACHE EXPIRED IN ZMQ_RESPONSE");
        }
    }

    private IsNewRequester(aSenderUID: string): boolean
    {
        return !this.mSeenMessages.has(aSenderUID);
    }

    private Open(): void
    {
        this.mRouter = new zmq.Router();
        this.mRouter.bind(this.mEndpoint)
            .then(() =>
            {
                this.ReceiveLoop();
            });
    }

    private async ReceiveLoop(): Promise<void>
    {
        for await (const [routing_id, sender_uid, nonce, msg] of this.mRouter)
        {
            const lSenderUID: string = sender_uid.toString();
            if (this.IsNewRequester(lSenderUID))
            {
                this.HandleOpening(lSenderUID);
            }

            this.HandleRequest(sender_uid, nonce, msg, routing_id);
        }
    }

    private RequestInCache(aSenderUID: string, aNonce: number): boolean
    {
        const lMessageId: string = aSenderUID + aNonce.toString();

        return this.mCachedRequests.has(lMessageId);
    }

    private UnseenRequest(aSenderUID: string, aNonce: number): boolean
    {
        const lRequesterEntry: TRequesterEntry = this.mSeenMessages.get(aSenderUID)!;

        const lHighEnough: boolean = aNonce > lRequesterEntry.HighestConsecutiveNonce;
        const lInSeenNoncesMap: boolean = lRequesterEntry.SeenNonces.has(aNonce);

        return lHighEnough && !lInSeenNoncesMap;
    }

    private UpdateSeenMessages(aSenderUID: string, aNewNonce: number): void
    {
        const lRequesterEntry: TRequesterEntry = this.mSeenMessages.get(aSenderUID)!;

        if (aNewNonce === lRequesterEntry.HighestConsecutiveNonce + 1)
        {
            lRequesterEntry.HighestConsecutiveNonce += 1;
            this.GarbageCleanSeenNonces(lRequesterEntry);
        }
        else
        {
            // Set the nonce as seen
            lRequesterEntry.SeenNonces.set(aNewNonce, true);
            this.GarbageCleanSeenNonces(lRequesterEntry);
        }
    }

    public Close(): void
    {
        this.mCachedRequests.clear();

        this.mRouter.linger = 0;
        this.mRouter.close();
        this.mRouter = undefined!;
    }
}

import { Queue } from "typescript-collections";
import * as zmq from "zeromq";
import Config from "./Config";
import {
    DEFAULT_ZMQ_RESPONSE_ERROR_HANDLERS,
    TResponseHwmWarning,
    TZMQResponseErrorHandlers,
} from "./Errors";
import ExpiryMap from "./Utils/ExpiryMap";
import { NonceMap } from "./Utils/NonceMap";
import { ERequestBody } from "./ZMQRequest";

export const RESPONSE_CACHE_EXPIRED: string = "ZMQ_RESPONSE ERROR: MESSAGE NOT IN CACHE";

type TZmqSendRequest =
{
    Requester: string;
    Response: TResponseBody;
};
type TResponseBody = [routingId: Buffer, nonce: Buffer | string, repsonse: string];

export class ZMQResponse
{
    private readonly mCachedRequests: ExpiryMap<string, string | Promise<string>>;
    private readonly mEndpoint: string;
    private readonly mErrorHandlers: TZMQResponseErrorHandlers;
    private readonly mRequestHandler: (aRequest: string) => Promise<string>;
    private mRouter!: zmq.Router;
    private mSafeToSend: boolean = true;
    private readonly mSeenMessages: Map<string, NonceMap> = new Map();
    private readonly mSendQueue: Queue<TZmqSendRequest> = new Queue();

    public constructor(
        aReplierEndpoint: string,
        aReceiver: (aRequest: string) => Promise<string>,
        aErrorHandlers?: TZMQResponseErrorHandlers,
    )
    {
        this.mCachedRequests = new ExpiryMap(3 * Config.MaximumLatency);    // 3 times latency assumption, this is a bit arbitrary
        this.mEndpoint = aReplierEndpoint;
        this.mRequestHandler = aReceiver;
        this.mErrorHandlers = aErrorHandlers ?? DEFAULT_ZMQ_RESPONSE_ERROR_HANDLERS;

        this.Open();
    }

    public get Endpoint(): string
    {
        return this.mEndpoint;
    }

    private static GetCacheId(lSenderUID: string, nonce: Buffer): string
    {
        return lSenderUID + nonce.toString();
    }

    private HandleDuplicateRequest(aSenderUID: string, routing_id: Buffer, nonce: Buffer): void
    {
        const lCacheId: string = ZMQResponse.GetCacheId(aSenderUID, nonce);
        const lCachedResponse: string | Promise<string> | undefined = this.mCachedRequests.get(lCacheId);

        if (typeof lCachedResponse === "string")
        {
            this.QueueSend(
                {
                    Requester: aSenderUID,
                    Response: [routing_id, nonce, lCachedResponse],
                },
            );
        }
        else if (lCachedResponse === undefined)
        {
            this.QueueSend(
                {
                    Requester: aSenderUID,
                    Response: [routing_id, nonce, RESPONSE_CACHE_EXPIRED],
                },
            );
        }
    }

    private HandleNewRequest(sender_uid: Buffer, nonce: Buffer, msg: Buffer, routing_id: Buffer): void
    {
        const lSenderUID: string = sender_uid.toString();
        const lMessageId: string = ZMQResponse.GetCacheId(lSenderUID, nonce);

        const lPromise: Promise<string> = this.mRequestHandler(msg.toString());
        this.mCachedRequests.set(lMessageId, lPromise); // TODO: Timer starts from when promise is inserted, this will cause issues if we move to an req, ack, rep model

        lPromise.then((aResponse: string): void =>      // TODO: Review performance if we use a non-blocking await lPromise (would need to wrap in its own async method)
        {                                               // NOTE: We could wrap lPromise: Promise<string> | string in a Promise.resolve(lPromise) instead of needing await
            this.mCachedRequests.set(lMessageId, aResponse);
            this.QueueSend(
                {
                    Requester: lSenderUID,
                    Response: [routing_id, nonce, aResponse],
                },
            );
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
        else
        {
            this.HandleDuplicateRequest(lSenderUID, routing_id, nonce);
        }
    }

    private HandleZMQSendError(aError: any, aRequest: TZmqSendRequest): void
    {
        if (aError && aError.code && aError.code === "EAGAIN")
        {
            const lHighWaterMarkWarning: TResponseHwmWarning =
            {
                Requester: aRequest.Requester,
                Nonce: Number(aRequest.Response[ERequestBody.Nonce]),
                Message: aRequest.Response[ERequestBody.Message],
            };
            this.mErrorHandlers.HighWaterMarkWarning(lHighWaterMarkWarning);
        }
        else
        {
            throw aError;
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
        this.mRouter.mandatory = true;

        this.mRouter.bind(this.mEndpoint)
            .then(() =>
            {
                this.ReceiveLoop();
            });
    }

    private async ProcessSend(): Promise<void>
    {
        const lNextSend: TZmqSendRequest | undefined = this.mSendQueue.peek();

        if (lNextSend && this.mSafeToSend)
        {
            this.mSafeToSend = false;
            this.mSendQueue.dequeue();

            try
            {
                await this.mRouter.send(lNextSend.Response);
            }
            catch (aError)
            {
                this.HandleZMQSendError(aError, lNextSend); // TODO: Re-queue the request
            }

            this.mSafeToSend = true;
            this.ProcessSend();
        }
    }

    private QueueSend(aRequest: TZmqSendRequest): void
    {
        this.mSendQueue.enqueue(aRequest);
        this.ProcessSend();
    }

    private async ReceiveLoop(): Promise<void>
    {
        for await (const [routing_id, sender_uid, nonce, msg] of this.mRouter)
        {
            if (this.mRouter)
            {
                const lSenderUID: string = sender_uid.toString();
                this.InitRequesterIfEmpty(lSenderUID);
                this.HandleRequest(sender_uid, nonce, msg, routing_id);
            }
        }
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

import * as zmq from "zeromq";
import { DEFAULT_ZMQ_SUBSCRIBER_ERROR_HANDLERS, TZMQSubscriberErrorHandlers } from "../Errors";
import JSONBigInt from "../Utils/JSONBigInt";
import {
    EMessageType,
    EPublishMessage,
    TPublishMessage,
    TRecoveryMessage,
    TRecoveryRequest,
    TRecoveryResponse,
} from "../ZMQPublisher";
import { TRequestResponse, ZMQRequest } from "../ZMQRequest";
import TopicEntry from "./TopicEntry";

export type SubscriptionCallback = (aMessage: string) => void;

export type TEndpointEntry =
{
    Subscriber: zmq.Subscriber;
    Requester: ZMQRequest;
    TopicEntries: Map<string, TopicEntry>;
};

type TInternalSubscription =
{
    Endpoint: string;
    Topic: string;
};

export type TSubscriptionEndpoints =
{
    PublisherAddress: string;
    RequestAddress: string;
};

export class ZMQSubscriber
{
    private readonly mEndpoints: Map<string, TEndpointEntry> = new Map<string, TEndpointEntry>();
    private readonly mErrorHandlers: TZMQSubscriberErrorHandlers;
    private mSubscriptions: Map<number, TInternalSubscription> = new Map();
    private mTokenId: number = 0;

    public constructor(aErrorHandlers?: TZMQSubscriberErrorHandlers)
    {
        this.mErrorHandlers = aErrorHandlers ?? DEFAULT_ZMQ_SUBSCRIBER_ERROR_HANDLERS;
    }

    private get SubscriptionId(): number
    {
        return ++this.mTokenId;
    }

    private static CloseEndpoint(lEndpoint: TEndpointEntry): void
    {
        lEndpoint.Subscriber.linger = 0;
        lEndpoint.Subscriber.close();
        lEndpoint.Requester.Close();
    }

    private async AddSubscriptionEndpoint(aEndpoint: TSubscriptionEndpoints): Promise<void>
    {
        const lSubSocket: zmq.Subscriber = new zmq.Subscriber;
        lSubSocket.connect(aEndpoint.PublisherAddress);

        const lSocketEntry: TEndpointEntry = {
            Subscriber: lSubSocket,
            Requester: new ZMQRequest(aEndpoint.RequestAddress),
            TopicEntries: new Map<string, TopicEntry>(),
        };

        this.mEndpoints.set(aEndpoint.PublisherAddress, lSocketEntry);

        for await (const aBuffers of lSubSocket)
        {
            if (this.mEndpoints.has(aEndpoint.PublisherAddress))
            {
                this.ParseNewMessage(aBuffers, aEndpoint);
            }
        }
    }

    private CallSubscribers(aEndpoint: TSubscriptionEndpoints, aTopic: string, aMessage: string): void
    {
        this.mEndpoints.get(aEndpoint.PublisherAddress)!.TopicEntries.get(aTopic)!.Callbacks.forEach(
            (aCallback: SubscriptionCallback): void =>
            {
                aCallback(aMessage);
            },
        );
    }

    private EmitCacheError(aEndpoint: TSubscriptionEndpoints, aTopic: string, aMessageId: number): void
    {
        this.mErrorHandlers.CacheError(
            {
                Endpoint: aEndpoint,
                Topic: aTopic,
                MessageNonce: aMessageId,
            },
        );
    }

    private EmitMissedMessageError(aTopic: string, aNonces: number[]): void
    {
        this.mErrorHandlers.DroppedMessageWarn(
            {
                Topic: aTopic,
                Nonces: aNonces,
            },
        );
    }

    private InitTopicEntry(
        aEndpoint: TSubscriptionEndpoints,
        aTopic: string,
        aSubscriptionId: number,
        aCallback: (aMessage: string) => void,
    ): TopicEntry
    {
        const lTopicEntry: TopicEntry = new TopicEntry(aEndpoint, aTopic, this.RecoverMissingMessages.bind(this));
        lTopicEntry.Callbacks.set(aSubscriptionId, aCallback);

        return lTopicEntry;
    }

    private ParseNewMessage(aBuffers: Buffer[], aEndpoint: TSubscriptionEndpoints): void
    {
        const lEncodedMessage: string[] = aBuffers.map((aBuffer: Buffer): string => aBuffer.toString());
        const [lTopic, lType, lReceivedNonce, lMessage]: TPublishMessage =
        [
            lEncodedMessage[EPublishMessage.Topic],
            lEncodedMessage[EPublishMessage.MessageType] as EMessageType,
            Number(lEncodedMessage[EPublishMessage.Nonce]),
            lEncodedMessage[EPublishMessage.Message],
        ];

        const lTopicEntry: TopicEntry = this.mEndpoints.get(aEndpoint.PublisherAddress)!.TopicEntries.get(lTopic)!;
        if (lType === EMessageType.HEARTBEAT)
        {
            lTopicEntry.ProcessHeartbeatMessage(lReceivedNonce);
        }
        else if (lType === EMessageType.PUBLISH && lReceivedNonce > lTopicEntry.Nonce)
        {
            lTopicEntry.ProcessPublishMessage(lReceivedNonce);
            this.CallSubscribers(aEndpoint, lTopic, lMessage);
        }
    }

    private PruneIfEmpty(aInternalSubscription: TInternalSubscription): void
    {
        const lEndpoint: TEndpointEntry = this.mEndpoints.get(aInternalSubscription.Endpoint)!;
        const lTopicEntry: TopicEntry = lEndpoint.TopicEntries.get(aInternalSubscription.Topic)!;

        if (lTopicEntry.Callbacks.size === 0)
        {
            lEndpoint.Subscriber.unsubscribe(aInternalSubscription.Topic);
            lEndpoint.TopicEntries.delete(aInternalSubscription.Topic);

            if (lEndpoint.TopicEntries.size === 0)
            {
                ZMQSubscriber.CloseEndpoint(lEndpoint);
                this.mEndpoints.delete(aInternalSubscription.Endpoint);
            }
        }
    }

    private async RecoverMissingMessages(
        aEndpoint: TSubscriptionEndpoints,
        aTopic: string,
        aMessageIds: number[],
    ): Promise<void>
    {
        // TODO: Check for possibility that a messages gets played twice, I think I handled this via nonce...
        this.EmitMissedMessageError(aTopic, aMessageIds);
        const lFormattedRequest: TRecoveryRequest = [aTopic, ...aMessageIds];   // PERF: Array manipulation

        const lEndpointEntry: TEndpointEntry = this.mEndpoints.get(aEndpoint.PublisherAddress)!;
        const lMissingMessages: TRequestResponse
            = await lEndpointEntry.Requester.Send(JSONBigInt.Stringify(lFormattedRequest));

        if (typeof lMissingMessages === "string")
        {
            const lParsedMessages: TRecoveryResponse = JSONBigInt.Parse(lMissingMessages.toString());

            for (let i: number = 0; i < lParsedMessages.length; ++i)
            {
                const lParsedMessage: TRecoveryMessage = lParsedMessages[i];
                if (lParsedMessage.length === 1)
                {
                    this.EmitCacheError(aEndpoint, aTopic, aMessageIds[i]);
                }
                else
                {
                    this.CallSubscribers(aEndpoint, aTopic, lParsedMessage[EPublishMessage.Message]);
                }
            }
        }
        else
        {
            for (let i: number = 0; i < aMessageIds.length; ++i)
            {
                this.EmitCacheError(aEndpoint, aTopic, aMessageIds[i]);
            }
        }
    }

    public Close(): void
    {
        this.mEndpoints.forEach((aEndpoint: TEndpointEntry): void =>
        {
            ZMQSubscriber.CloseEndpoint(aEndpoint);
        });

        this.mEndpoints.clear();
        this.mSubscriptions.clear();
    }

    public Subscribe(aEndpoint: TSubscriptionEndpoints, aTopic: string, aCallback: SubscriptionCallback): number
    {
        let lEndpoint: TEndpointEntry | undefined = this.mEndpoints.get(aEndpoint.PublisherAddress);
        if (!lEndpoint)
        {
            this.AddSubscriptionEndpoint(aEndpoint);
            lEndpoint = this.mEndpoints.get(aEndpoint.PublisherAddress)!;
        }

        const lSubscriptionId: number = this.SubscriptionId;
        const lExistingTopic: TopicEntry | undefined = lEndpoint.TopicEntries.get(aTopic);
        if (lExistingTopic)
        {
            lExistingTopic.Callbacks.set(lSubscriptionId, aCallback);
        }
        else
        {
            const lTopicEntry: TopicEntry = this.InitTopicEntry(aEndpoint, aTopic, lSubscriptionId, aCallback);

            lEndpoint.Subscriber.subscribe(aTopic);
            lEndpoint.TopicEntries.set(aTopic, lTopicEntry);
        }

        this.mSubscriptions.set(lSubscriptionId, { Endpoint: aEndpoint.PublisherAddress, Topic: aTopic });

        return lSubscriptionId;
    }

    public Unsubscribe(aSubscriptionId: number): void
    {
        const lInternalSubscription: TInternalSubscription | undefined = this.mSubscriptions.get(aSubscriptionId);

        if (lInternalSubscription)
        {
            const lEndpoint: TEndpointEntry = this.mEndpoints.get(lInternalSubscription.Endpoint)!;
            const lTopicEntry: TopicEntry = lEndpoint.TopicEntries.get(lInternalSubscription.Topic)!;

            lTopicEntry.Callbacks.delete(aSubscriptionId);
            this.mSubscriptions.delete(aSubscriptionId);

            this.PruneIfEmpty(lInternalSubscription);
        }
    }
}

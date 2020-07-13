import * as zmq from "zeromq";
import JSONBigInt from "./Utils/JSONBigInt";
import { EMessageType, EPublishMessage, TPublisherMessage, TRecoveryRequest, TRecoveryResponse } from "./ZMQPublisher";
import { ZMQRequest } from "./ZMQRequest";

const UNKNOWN_SUBSCRIPTION: string = "ERROR: CANNOT UNSUBSCRIBE FROM UNDEFINED SUBSCRIPTION";

export type SubscriptionCallback = (aMessage: string) => void;

type TTopicEntry =
{
    Nonce: number;
    Callbacks: Map<number, SubscriptionCallback>;
};

type TEndpointEntry =
{
    Subscriber: zmq.Subscriber;
    Requester: ZMQRequest;
    TopicEntries: Map<string, TTopicEntry>;
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
    private mEndpoints: Map<string, TEndpointEntry> = new Map<string, TEndpointEntry>();
    private mSubscriptions: Map<number, TInternalSubscription> = new Map();
    private mTokenId: number = 0;

    private get SubscriptionId(): number
    {
        return ++this.mTokenId;
    }

    public constructor()
    {}

    private async AddSubscriptionEndpoint(aEndpoint: TSubscriptionEndpoints): Promise<void>
    {
        const lSubSocket: zmq.Subscriber = new zmq.Subscriber;
        lSubSocket.connect(aEndpoint.PublisherAddress);

        const lSocketEntry: TEndpointEntry = {
            Subscriber: lSubSocket,
            Requester: new ZMQRequest(aEndpoint.RequestAddress),
            TopicEntries: new Map<string, TTopicEntry>(),
        };
        lSocketEntry.Requester.Start();
        this.mEndpoints.set(aEndpoint.PublisherAddress, lSocketEntry);

        for await (const buffers of lSubSocket)
        {
            const lEncodedMessage: string[] = buffers.map((value: Buffer): string => value.toString());
            const [lTopic, lType, lNonce, lMessage]: TPublisherMessage =
            [
                lEncodedMessage[0],
                lEncodedMessage[1] as EMessageType,
                Number(lEncodedMessage[2]),
                lEncodedMessage[3],
            ];

            if (lType === EMessageType.HEARTBEAT)
            {
                this.ProcessNonce(aEndpoint, lTopic, lNonce, true);
            }
            else
            {
                // Process message nonce and call callback if not duplicate
                if (this.ProcessNonce(aEndpoint, lTopic, lNonce))
                {
                    // Forwards messages to their relevant subscriber
                    const lTopicCallbacks: Map<number, SubscriptionCallback>
                        = lSocketEntry.TopicEntries.get(lTopic)!.Callbacks;

                    if (lTopicCallbacks.size > 0)
                    {
                        lTopicCallbacks.forEach((aCallback: SubscriptionCallback): void =>
                        {
                            aCallback(lMessage);
                        });
                    }
                    else
                    {
                        throw new Error("ERROR: No registered callbacks for this topic");
                    }
                }
            }
        }
    }

    private ProcessNonce(
        aEndpoint: TSubscriptionEndpoints,
        aTopic: string,
        aNonce: number,
        aHeartbeat: boolean = false,
    ): boolean
    {
        const lEndpoint: TEndpointEntry = this.mEndpoints.get(aEndpoint.PublisherAddress)!;
        const lTopicEntry: TTopicEntry = this.mEndpoints.get(aEndpoint.PublisherAddress)!.TopicEntries.get(aTopic)!;
        const lLastSeenNonce: number = lTopicEntry.Nonce;
        const lExpectedNonce: number = aHeartbeat ? lLastSeenNonce : lLastSeenNonce + 1;
        let lCallCallback: boolean = true;

        if (aNonce === lExpectedNonce)
        {
            lTopicEntry.Nonce = aNonce;
        }
        else if (aNonce > lExpectedNonce)
        {
            const lStart: number = lExpectedNonce === 0 ? 1 : lExpectedNonce;   // No message zero in this protocol
            const lEnd: number = aHeartbeat ? aNonce : aNonce - 1;

            const lMissingNonces: number[] = [];
            for (let i: number = lStart; i <= lEnd; ++i)
            {
                lMissingNonces.push(i);
            }

            this.RecoverMissingMessages(aEndpoint, aTopic, lEndpoint, lMissingNonces);
            lTopicEntry.Nonce = aNonce;
        }
        else
        {
            lCallCallback = false;
        }

        return lCallCallback;
    }

    private async RecoverMissingMessages(
        aEndpoint: TSubscriptionEndpoints,
        aTopic: string,
        aEndpointEntry: TEndpointEntry,
        aMessageIds: number[],
    ): Promise<void>
    {
        const lFormattedRequest: TRecoveryRequest = [aTopic, ...aMessageIds];   // PERF: Array manipulation

        const lMissingMessages: string = await aEndpointEntry.Requester.Send(JSONBigInt.Stringify(lFormattedRequest));
        const lParsedMessages: TRecoveryResponse = JSONBigInt.Parse(lMissingMessages.toString());

        lParsedMessages.forEach((aParsedMessage: string[]): void =>
        {
            this.mEndpoints.get(aEndpoint.PublisherAddress)!.TopicEntries.get(aTopic)!.Callbacks.forEach(
            (aCallback: SubscriptionCallback): void =>
            {
                aCallback(aParsedMessage[EPublishMessage.Message]);
            });
        });
    }

    public Start(): void
    {}

    public Stop(): void
    {
        this.mEndpoints.forEach((aEndpoint: TEndpointEntry): void =>
        {
            aEndpoint.Subscriber.linger = 0;
            aEndpoint.Subscriber.close();
        });

        this.mEndpoints.clear();
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
        const lExistingTopic: TTopicEntry | undefined = lEndpoint.TopicEntries.get(aTopic);
        if (lExistingTopic)
        {
            lExistingTopic.Callbacks.set(lSubscriptionId, aCallback);
        }
        else
        {
            lEndpoint.Subscriber.subscribe(aTopic);
            lEndpoint.TopicEntries.set(
                aTopic,
                {
                    Nonce: 0,
                    Callbacks: new Map([[lSubscriptionId, aCallback]]), // Initialize map with new callback and callback id
                },
            );
        }

        this.mSubscriptions.set(lSubscriptionId, { Endpoint: aEndpoint.PublisherAddress, Topic: aTopic });

        return lSubscriptionId;
    }

    public Unsubscribe(aSubscriptionId: number): void
    {
        const lInternalSubscription: TInternalSubscription | undefined = this.mSubscriptions.get(aSubscriptionId);

        if (!lInternalSubscription)
        {
            throw new Error(UNKNOWN_SUBSCRIPTION);
        }

        const lEndpoint: TEndpointEntry = this.mEndpoints.get(lInternalSubscription.Endpoint)!;
        const lTopicEntry: TTopicEntry = lEndpoint.TopicEntries.get(lInternalSubscription.Topic)!;

        lTopicEntry.Callbacks.delete(aSubscriptionId);
        this.mSubscriptions.delete(aSubscriptionId);

        if (lTopicEntry.Callbacks.size === 0)
        {
            lEndpoint.Subscriber.unsubscribe(lInternalSubscription.Topic);
            lEndpoint.TopicEntries.delete(lInternalSubscription.Topic);
        }
    }

}

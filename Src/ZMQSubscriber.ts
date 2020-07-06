import * as zmq from "zeromq";
import { DUMMY_ENDPOINTS, EEndpoint } from "./Constants";
import { TEndpointAddresses } from "./Interfaces";
import JSONBigInt from "./Utils/JSONBigInt";
import { EMessageType, TPublisherMessage } from "./ZMQPublisher";
import { ZMQRequest } from "./ZMQRequest";

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

export class ZMQSubscriber
{
    private mEndpoints: Map<EEndpoint, TEndpointEntry> = new Map<EEndpoint, TEndpointEntry>();
    private mTokenId: number = 0;

    private get SubscriptionId(): number
    {
        return ++this.mTokenId;
    }

    public constructor()
    {}

    private async AddSubscriptionEndpoint(aEndpoint: EEndpoint): Promise<void>
    {
        const lEndpoint: TEndpointAddresses = DUMMY_ENDPOINTS[aEndpoint];
        const lSubSocket: zmq.Subscriber = new zmq.Subscriber;
        lSubSocket.connect(lEndpoint.PublisherAddress);

        const lSocketEntry: TEndpointEntry = {
            Subscriber: lSubSocket,
            Requester: new ZMQRequest(lEndpoint.RequestAddress),
            TopicEntries: new Map<string, TTopicEntry>(),
        };
        lSocketEntry.Requester.Start();
        this.mEndpoints.set(aEndpoint, lSocketEntry);

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
                const lNextMessageNonce: number = lNonce + 1;
                this.ProcessNonce(aEndpoint, lTopic, lNextMessageNonce);
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

    private ProcessNonce(aEndpoint: EEndpoint, aTopic: string, aNonce: number): boolean
    {
        const lEndpoint: TEndpointEntry = this.mEndpoints.get(aEndpoint)!;
        const lTopicEntry: TTopicEntry = this.mEndpoints.get(aEndpoint)!.TopicEntries.get(aTopic)!;
        const lLastSeenNonce: number = lTopicEntry.Nonce;
        const lExpectedNonce: number = lLastSeenNonce + 1;
        let lCallCallback: boolean = true;

        if (aNonce === lExpectedNonce)
        {
            lTopicEntry.Nonce = aNonce;
        }
        else if (aNonce > lExpectedNonce)
        {
            const lMissingNonces: string[] = [];
            for (let i: number = lExpectedNonce; i < aNonce; ++i)
            {
                lMissingNonces.push(i.toString());
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
        aEndpoint: EEndpoint,
        aTopic: string,
        aEndpointEntry: TEndpointEntry,
        aMessageIds: string[],
    ): Promise<void>
    {
        const lFormattedRequest: string[] = aMessageIds;
        lFormattedRequest.unshift(aTopic);

        const lMissingMessages: string = await aEndpointEntry.Requester.Send(JSONBigInt.Stringify(aMessageIds));
        const lParsedMessages: string[] = JSONBigInt.Parse(lMissingMessages.toString());

        lParsedMessages.forEach((aParsedMessage: string): void =>
        {
            this.mEndpoints.get(aEndpoint)!.TopicEntries.get(aTopic)!.Callbacks.forEach(
            (aCallback: SubscriptionCallback): void =>
            {
                aCallback(aParsedMessage[3]);   // TODO: Use Enum, not magic numbers
            });
        });
    }

    public Start(): void
    {
        // Connect to all publishers on start
        const lEndpoints: string[] = Object.values(EEndpoint);

        for (let i: number = 0; i < lEndpoints.length; ++i)
        {
            this.AddSubscriptionEndpoint(lEndpoints[i] as EEndpoint);
        }
    }

    public Stop(): void
    {
        this.mEndpoints.forEach((aEndpoint: TEndpointEntry): void =>
        {
            aEndpoint.Subscriber.linger = 0;
            aEndpoint.Subscriber.close();
        });

        this.mEndpoints.clear();
    }

    public Subscribe(aEndpoint: EEndpoint, aTopic: string, aCallback: SubscriptionCallback): number
    {
        const lEndpoint: TEndpointEntry = this.mEndpoints.get(aEndpoint)!;
        const lExistingTopic: TTopicEntry | undefined = lEndpoint.TopicEntries.get(aTopic);

        const lSubscriptionId: number = this.SubscriptionId;
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

        return lSubscriptionId;
    }

    public Unsubscribe(aEndpoint: EEndpoint, aTopic: string, aSubscriptionId: number): void
    {
        // TODO: Can be driven using just aSubscriptionId
        // TODO: Remove topics that are no longer used
        const lEndpoint: TEndpointEntry = this.mEndpoints.get(aEndpoint)!;
        lEndpoint.Subscriber.unsubscribe(aTopic);     // TODO: What happens if we unsubscribe from a topic we never subscribed to?

        const lTopicEntry: TTopicEntry = lEndpoint.TopicEntries.get(aTopic)!;   // TODO: We crash if we try to unsubscribe from a non-existent topic

        lTopicEntry.Callbacks.delete(aSubscriptionId);
    }
}

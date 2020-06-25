import JSONBigInt from "./Utils/JSONBigInt";
import * as zmq from "zeromq";
import { EEndpoint, DUMMY_ENDPOINTS } from "./Constants";
import { IMessage, TEndpointAddresses } from "./Interfaces";
import { ZMQRequest } from "./ZMQRequest";

export type MessageCallback<P> = (aError: Error | undefined, aMessage: IMessage) => void;

type TTopicEntry =
{
    Nonce: bigint;
    Callbacks: Map<bigint, MessageCallback<any>>;
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
    private mTokenId: bigint = 0n;

    private get SubscriptionId(): bigint
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

        for await (const [topic, nonce, msg] of lSubSocket)
        {
            const lTopic: string = topic.toString();
            const lNonce: bigint = BigInt(nonce.toString());
            const lMessage: any = JSONBigInt.Parse(msg.toString());

            // Process message nonce and call callback if not duplicate
            if (this.ProcessNonce(aEndpoint, lTopic, lNonce))
            {
                // Forwards messages to their relevant subscriber
                const lTopicCallbacks: Map<bigint, MessageCallback<any>>
                    = lSocketEntry.TopicEntries.get(lTopic)!.Callbacks;

                if (lTopicCallbacks.size > 0)
                {
                    lTopicCallbacks.forEach((aCallback: MessageCallback<any>) =>
                    {
                        aCallback(undefined, { topic: lTopic, data: lMessage });
                    });
                }
                else
                {
                    console.error("ERROR: No registered callbacks for this topic");
                }
            }
        }
    }

    private ProcessNonce(aEndpoint: EEndpoint, aTopic: string, aNonce: bigint): boolean
    {
        const lEndpoint: TEndpointEntry = this.mEndpoints.get(aEndpoint)!;
        const lTopicEntry: TTopicEntry = this.mEndpoints.get(aEndpoint)!.TopicEntries.get(aTopic)!;
        const lLastSeenNonce: bigint = lTopicEntry.Nonce;
        const lExpectedNonce: bigint = lLastSeenNonce + 1n;
        let lCallCallback: boolean = true;

        if (aNonce === lExpectedNonce)
        {
            lTopicEntry.Nonce = aNonce;
        }
        else if (aNonce > lExpectedNonce)
        {
            console.error({
                msg: "ZMQ_SUB: MESSAGES MISSED",
                lExpectedNonce,
                ReceivedNonce: aNonce,
            });

            const lMissingNonces: string[] = [];
            for (let i: bigint = lExpectedNonce; i < aNonce; ++i)
            {
                lMissingNonces.push(i.toString());
            }

            this.RecoverMissingMessages(aEndpoint, aTopic, lEndpoint, lMissingNonces);
            lTopicEntry.Nonce = aNonce;
        }
        else
        {
            console.error({
                msg: "ZMQ_SUB: DUPLICATE MESSAGE",
                lExpectedNonce,
                ReceivedNonce: aNonce,
            });

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

        lParsedMessages.forEach((aParsedMessage: string) =>
        {
            this.mEndpoints.get(aEndpoint)!.TopicEntries.get(aTopic)!.Callbacks.forEach(
            (aCallback: MessageCallback<any>) =>
            {
                aCallback(undefined, { topic: aTopic, data: aParsedMessage });
            });
        });
    }

    public async Start(): Promise<void>
    {
        // Connect to all publishers on start
        const lEndpoints: string[] = Object.values(EEndpoint);

        for (let i: number = 0; i < lEndpoints.length; ++i)
        {
            this.AddSubscriptionEndpoint(lEndpoints[i] as EEndpoint)
                .catch((aReason: any) =>
                {
                    throw new Error("Failed to add subscription endpoint \n" + JSONBigInt.Stringify(aReason));
                });
        }
    }

    public Stop(): void
    {
        this.mEndpoints.forEach((aEndpoint: TEndpointEntry) =>
        {
            aEndpoint.Subscriber.linger = 0;
            aEndpoint.Subscriber.close();
        });

        this.mEndpoints.clear();
    }

    public async Subscribe<P>(aEndpoint: EEndpoint, aTopic: string, aCallback: MessageCallback<P>): Promise<bigint>
    {
        const lEndpoint: TEndpointEntry = this.mEndpoints.get(aEndpoint)!;
        const lExistingTopic: TTopicEntry | undefined = lEndpoint.TopicEntries.get(aTopic);

        const lSubscriptionId: bigint = this.SubscriptionId;
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
                    Nonce: 0n,
                    Callbacks: new Map([[lSubscriptionId, aCallback]]), // Initialize map with new callback and callback id
                },
            );
        }

        return lSubscriptionId;
    }

    public Unsubscribe(aEndpoint: EEndpoint, aTopic: string, aSubscriptionId: bigint): void
    {
        // TODO: Can be driven using just aSubscriptionId
        // TODO: Remove topics that are no longer used
        const lEndpoint: TEndpointEntry = this.mEndpoints.get(aEndpoint)!;
        lEndpoint.Subscriber.unsubscribe(aTopic);     // TODO: What happens if we unsubscribe from a topic we never subscribed to?

        const lTopicEntry: TTopicEntry = lEndpoint.TopicEntries.get(aTopic)!;   // TODO: We crash if we try to unsubscribe from a non-existent topic

        lTopicEntry.Callbacks.delete(aSubscriptionId);
    }
}

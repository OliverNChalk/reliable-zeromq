import * as zmq from "zeromq";
import { MessageLike } from "zeromq";
import { DUMMY_ENDPOINTS, EEndpoint, HEARTBEAT_INTERVAL, MAXIMUM_LATENCY } from "./Constants";
import { TEndpointAddresses } from "./Interfaces";
import ExpiryMap from "./Utils/ExpiryMap";
import JSONBigInt from "./Utils/JSONBigInt";
import { ZMQResponse } from "./ZMQResponse";

const CACHE_EXPIRY_MS: number = 3 * MAXIMUM_LATENCY;    // HEARTBEAT_TIME + PUBLISH_TIME + REQUEST_TIME
const CACHE_ERROR: string = "PUBLISHER ERROR: MESSAGE NOT IN CACHE";
const BAD_REQUEST_ERROR: string = "BAD REQUEST: TOPIC DOES NOT EXIST";

export enum EMessageType
{
    HEARTBEAT = "HEARTBEAT",
    PUBLISH = "PUBLISH",
}

type TTopicDetails =
{
    LatestMessageNonce: bigint;
    LatestMessageTimestamp: number;
};

export class ZMQPublisher
{
    private mMessageCaches: Map<string, Map<bigint, string[]>> = new Map();

    private mTopicDetails: Map<string, TTopicDetails> = new Map();
    private mPublisher!: zmq.Publisher;

    private readonly mPublisherEndpoint: EEndpoint;
    private mReplier: ZMQResponse;

    public constructor(aEndpoint: EEndpoint)
    {
        this.mPublisherEndpoint = aEndpoint;

        this.mReplier = new ZMQResponse(DUMMY_ENDPOINTS[aEndpoint].RequestAddress, this.HandleRequest);
    }

    private CheckHeartbeats = async(): Promise<void> =>
    {
        if (this.mPublisher)    // TODO: Is a publisher null-check better than IEngine parent class with mIsRunning?
        {
            this.mTopicDetails.forEach(async(aValue: TTopicDetails, aKey: string): Promise<void> =>
            {
                if (aValue.LatestMessageTimestamp + HEARTBEAT_INTERVAL <= Date.now())
                {
                    await this.mPublisher.send(
                        [
                            aKey,
                            EMessageType.HEARTBEAT,
                            aValue.LatestMessageNonce.toString(),
                            "",
                        ],
                    );
                }
            });

            setTimeout(this.CheckHeartbeats, HEARTBEAT_INTERVAL);
        }
    }

    private HandleRequest = (aMessage: string): Promise<string> =>
    {
        const lRequest: string[] = JSONBigInt.Parse(aMessage);
        const lTopic: string = lRequest.shift()!;
        const lDecodedRequest: bigint[] = lRequest.map((aValue: string): bigint => BigInt(aValue));

        const lRequestedMessages: (MessageLike | MessageLike[])[] = [];

        if (this.mMessageCaches.has(lTopic))
        {
            for (let i: number = 0; i < lDecodedRequest.length; ++i)
            {
                const lMessageId: bigint = lDecodedRequest[i];
                const lMessage: MessageLike | MessageLike[] =
                        this.mMessageCaches.get(lTopic)!.get(lMessageId)
                    ||  CACHE_ERROR;
                lRequestedMessages.push(lMessage);
            }
        }
        else
        {
            throw new Error(BAD_REQUEST_ERROR);
        }

        return Promise.resolve(JSONBigInt.Stringify(lRequestedMessages));
    }

    public async Publish(aTopic: string, aData: string): Promise<void>
    {
        const lSocket: zmq.Publisher = this.mPublisher!;

        if (!this.mMessageCaches.has(aTopic))
        {
            this.mMessageCaches.set(aTopic, new ExpiryMap(CACHE_EXPIRY_MS));
        }

        const lMessageNonce: bigint = this.mTopicDetails.get(aTopic)!.LatestMessageNonce;
        const lMessage: string[] = [
            aTopic,
            EMessageType.PUBLISH,
            lMessageNonce.toString(),
            JSONBigInt.Stringify(aData),
        ];
        this.mMessageCaches.get(aTopic)!.set(lMessageNonce, lMessage);

        await lSocket.send(lMessage);
    }

    public async Start(): Promise<void>
    {
        const lOurAddresses: TEndpointAddresses = DUMMY_ENDPOINTS[this.mPublisherEndpoint];

        this.mPublisher = new zmq.Publisher;
        await this.mPublisher.bind(lOurAddresses.PublisherAddress);

        await this.mReplier.Start();
    }

    public Stop(): void
    {
        this.mReplier.Stop();

        this.mPublisher.close();
        delete(this.mPublisher);
    }
}

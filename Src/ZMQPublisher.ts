import * as zmq from "zeromq";
import {
    DUMMY_ENDPOINTS,
    EEndpoint,
    HEARTBEAT_INTERVAL,
    PUBLISHER_CACHE_EXPIRY_MS,
} from "./Constants";
import { TEndpointAddresses } from "./Interfaces";
import ExpiryMap from "./Utils/ExpiryMap";
import JSONBigInt from "./Utils/JSONBigInt";
import { ZMQResponse } from "./ZMQResponse";

const CACHE_ERROR: string = "PUBLISHER ERROR: MESSAGE NOT IN CACHE";
const BAD_REQUEST_ERROR: string = "BAD REQUEST: TOPIC DOES NOT EXIST";

export enum EMessageType
{
    HEARTBEAT = "HEARTBEAT",
    PUBLISH = "PUBLISH",
}

type TTopicDetails =
{
    LatestMessageNonce: number;
    LatestMessageTimestamp: number;
};

export class ZMQPublisher
{
    private mMessageCaches: Map<string, ExpiryMap<number, string[]>> = new Map();
    private mTopicDetails: Map<string, TTopicDetails> = new Map();

    private mPublisher!: zmq.Publisher;
    private readonly mPublisherEndpoint: EEndpoint;
    private mResponse: ZMQResponse;

    public constructor(aEndpoint: EEndpoint)
    {
        this.mPublisherEndpoint = aEndpoint;

        this.mResponse = new ZMQResponse(DUMMY_ENDPOINTS[aEndpoint].RequestAddress, this.HandleRequest);
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
        const lTopic: string = lRequest.shift()!;   // PERF: Ouch!
        const lDecodedRequest: number[] = lRequest.map((aValue: string): number => Number(aValue));

        const lRequestedMessages: string[][] = [];

        if (this.mMessageCaches.has(lTopic))
        {
            for (let i: number = 0; i < lDecodedRequest.length; ++i)
            {
                const lMessageId: number = lDecodedRequest[i];
                const lMessage: string[] =
                        this.mMessageCaches.get(lTopic)!.get(lMessageId)
                    ||  [CACHE_ERROR];
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
        let lCache: ExpiryMap<number, string[]> | undefined = this.mMessageCaches.get(aTopic);
        if (!lCache)
        {
            lCache = new ExpiryMap(PUBLISHER_CACHE_EXPIRY_MS);
            this.mMessageCaches.set(aTopic, lCache);
        }

        let lTopicDetails: TTopicDetails | undefined = this.mTopicDetails.get(aTopic);
        if (!lTopicDetails)
        {
            lTopicDetails =
            {
                LatestMessageNonce: 0,
                LatestMessageTimestamp: 0,
            };
            this.mTopicDetails.set(aTopic, lTopicDetails);
        }

        const lMessageNonce: number = lTopicDetails.LatestMessageNonce++;
        const lMessage: string[] = [
            aTopic,
            EMessageType.PUBLISH,
            lMessageNonce.toString(),
            JSONBigInt.Stringify(aData),
        ];
        lCache.set(lMessageNonce, lMessage);
        lTopicDetails.LatestMessageTimestamp = Date.now();

        await this.mPublisher!.send(lMessage);
    }

    public async Start(): Promise<void>
    {
        const lOurAddresses: TEndpointAddresses = DUMMY_ENDPOINTS[this.mPublisherEndpoint];

        this.mPublisher = new zmq.Publisher;
        await this.mPublisher.bind(lOurAddresses.PublisherAddress);

        await this.mResponse.Start();
        this.CheckHeartbeats();
    }

    public Stop(): void
    {
        this.mResponse.Stop();

        this.mPublisher.close();
        delete(this.mPublisher);
    }
}

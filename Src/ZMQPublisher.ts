import { Queue } from "typescript-collections";
import * as zmq from "zeromq";
import {
    HEARTBEAT_INTERVAL,
    PUBLISHER_CACHE_EXPIRY_MS,
} from "./Constants";
import ExpiryMap from "./Utils/ExpiryMap";
import JSONBigInt from "./Utils/JSONBigInt";
import { ZMQResponse } from "./ZMQResponse";
import { TSubscriptionEndpoints } from "./ZMQSubscriber";

const CACHE_ERROR: string = "PUBLISHER ERROR: MESSAGE NOT IN CACHE";
const BAD_REQUEST_ERROR: string = "BAD REQUEST: TOPIC DOES NOT EXIST";

export enum EMessageType
{
    HEARTBEAT = "HEARTBEAT",
    PUBLISH = "PUBLISH",
}

export type TPublisherMessage = [string, EMessageType, number, string];
export enum EPublishMessage
{
    Topic,
    MessageType,
    Nonce,
    Message,
}
export type TRecoveryRequest = [string, ...number[]];
export type TRecoveryResponse = string[][];

type TTopicDetails =
{
    LatestMessageNonce: number;
    LatestMessageTimestamp: number;
};
type TPublishRequest = string[];

export class ZMQPublisher
{
    private readonly mMessageCaches: Map<string, ExpiryMap<number, string[]>> = new Map();
    private readonly mPublisherEndpoint: string;
    private readonly mPublishQueue: Queue<TPublishRequest> = new Queue();
    private readonly mTopicDetails: Map<string, TTopicDetails> = new Map();
    private mHeartbeatTimeout: NodeJS.Timeout | undefined;
    private mPublisher!: zmq.Publisher;
    private mResponse: ZMQResponse;
    private mSafeToPublish: boolean = true;

    public constructor(aEndpoint: TSubscriptionEndpoints)
    {
        this.mPublisherEndpoint = aEndpoint.PublisherAddress;

        this.mResponse = new ZMQResponse(aEndpoint.RequestAddress, this.HandleRequest);
    }

    private CheckHeartbeats = async(): Promise<void> =>
    {
        this.mTopicDetails.forEach(async(aValue: TTopicDetails, aKey: string): Promise<void> =>
        {
            if (aValue.LatestMessageTimestamp + HEARTBEAT_INTERVAL <= Date.now())
            {
                await this.QueuePublish(
                    [
                        aKey,
                        EMessageType.HEARTBEAT,
                        aValue.LatestMessageNonce.toString(),
                        "",
                    ],
                );
            }
        });

        this.mHeartbeatTimeout = setTimeout(this.CheckHeartbeats, HEARTBEAT_INTERVAL);
    }

    private HandleRequest = (aMessage: string): Promise<string> =>
    {
        const lRequest: TRecoveryRequest = JSONBigInt.Parse(aMessage);
        const lTopic: string = lRequest[0];

        const lDecodedRequest: number[] = [];
        for (let i: number = 1; i < lRequest.length; ++i)
        {
            lDecodedRequest.push(Number(lRequest[i]));
        }

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

    private async ProcessPublish(): Promise<void>
    {
        const lNextSend: TPublishRequest | undefined = this.mPublishQueue.peek();

        if (lNextSend && this.mSafeToPublish)
        {
            this.mPublishQueue.dequeue();
            this.mSafeToPublish = false;

            await this.mPublisher.send(lNextSend);
            this.mSafeToPublish = true;

            this.ProcessPublish();
        }
    }

    private QueuePublish(aMessage: string[]): void
    {
        this.mPublishQueue.enqueue(aMessage);
        this.ProcessPublish();
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

        const lMessageNonce: number = ++lTopicDetails.LatestMessageNonce;
        const lMessage: string[] = [
            aTopic,
            EMessageType.PUBLISH,
            lMessageNonce.toString(),
            aData,
        ];
        lCache.set(lMessageNonce, lMessage);
        lTopicDetails.LatestMessageTimestamp = Date.now();

        await this.QueuePublish(lMessage);
    }

    public async Start(): Promise<void>
    {
        this.mPublisher = new zmq.Publisher;
        await this.mPublisher.bind(this.mPublisherEndpoint);

        await this.mResponse.Start();
        this.CheckHeartbeats();
    }

    public Stop(): void
    {
        this.mResponse.Stop();

        this.mPublisher.linger = 0;
        this.mPublisher.close();
        delete(this.mPublisher);
        clearTimeout(this.mHeartbeatTimeout!);
    }
}

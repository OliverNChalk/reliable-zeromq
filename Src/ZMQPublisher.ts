import { Queue } from "typescript-collections";
import * as zmq from "zeromq";
import Config from "./Config";
import { DEFAULT_ZMQ_PUBLISHER_ERROR_HANDLERS, TZMQPublisherErrorHandlers } from "./Errors";
import ExpiryMap from "./Utils/ExpiryMap";
import JSONBigInt from "./Utils/JSONBigInt";
import { ZMQResponse } from "./ZMQResponse";
import { TSubscriptionEndpoints } from "./ZMQSubscriber/ZMQSubscriber";

export const PUBLISHER_CACHE_EXPIRED: string = "ZMQ_PUBLISHER ERROR: MESSAGE NOT IN CACHE";

export enum EMessageType
{
    HEARTBEAT = "HEARTBEAT",
    PUBLISH = "PUBLISH",
}

export enum EPublishMessage
{
    Topic,
    MessageType,
    Nonce,
    Message,
}
export type TPublishMessage = [topic: string, type: EMessageType, nonce: number, message: string];

type TRecoveryFailure = [error: string];
export type TRecoveryMessage = TPublishMessage | TRecoveryFailure;
export type TRecoveryRequest = [string, ...number[]];
export type TRecoveryResponse = TRecoveryMessage[];

type TTopicDetails =
{
    LatestMessageNonce: number;
    LatestMessageTimestamp: number;
};

export class ZMQPublisher
{
    private readonly mEndpoint: TSubscriptionEndpoints;
    private readonly mErrorHandlers: TZMQPublisherErrorHandlers;
    private mHeartbeatTimeout: NodeJS.Timeout | undefined;
    private readonly mMessageCaches: Map<string, ExpiryMap<number, TPublishMessage>> = new Map();
    private mPublisher!: zmq.Publisher;
    private readonly mPublishQueue: Queue<TPublishMessage> = new Queue();
    private mResponse!: ZMQResponse;
    private mSafeToPublish: boolean = true;
    private readonly mTopicDetails: Map<string, TTopicDetails> = new Map();

    public constructor(aEndpoint: TSubscriptionEndpoints, aErrorHandlers?: TZMQPublisherErrorHandlers)
    {
        this.mEndpoint = aEndpoint;
        this.mErrorHandlers = aErrorHandlers ?? DEFAULT_ZMQ_PUBLISHER_ERROR_HANDLERS;

        this.CheckHeartbeats = this.CheckHeartbeats.bind(this);
    }

    public get Endpoint(): string
    {
        return this.mEndpoint.PublisherAddress;
    }

    private async CheckHeartbeats(): Promise<void>
    {
        this.mTopicDetails.forEach((aValue: TTopicDetails, aTopicKey: string): void =>
        {
            if (aValue.LatestMessageTimestamp + Config.HeartBeatInterval <= Date.now())
            {
                this.QueuePublish(
                    [
                        aTopicKey,
                        EMessageType.HEARTBEAT,
                        aValue.LatestMessageNonce,
                        "",
                    ],
                );
            }
        });

        this.mHeartbeatTimeout = setTimeout(this.CheckHeartbeats, Config.HeartBeatInterval);
    }

    private HandleRequest = (aMessage: string): Promise<string> =>
    {
        const lRequest: TRecoveryRequest = JSONBigInt.Parse(aMessage);
        const lTopic: string = lRequest[0];

        const lDecodedRequest: number[] = [];
        for (let i: number = 1; i < lRequest.length; ++i)
        {
            lDecodedRequest.push((lRequest[i]) as number);  // TRecoveryRequest is [string, ...number[]], so values at index 1+ are numbers
        }

        const lRequestedMessages: TRecoveryMessage[] = [];
        if (this.mMessageCaches.has(lTopic))
        {
            for (let i: number = 0; i < lDecodedRequest.length; ++i)
            {
                const lMessageId: number = lDecodedRequest[i];
                const lMessage: TPublishMessage | undefined = this.mMessageCaches.get(lTopic)!.get(lMessageId);
                lRequestedMessages.push(lMessage ?? [PUBLISHER_CACHE_EXPIRED]);
            }
        }

        return Promise.resolve(JSONBigInt.Stringify(lRequestedMessages));
    }

    private HandleZMQPublishError(aError: any, aFormattedMessage: string[]): void
    {
        if (aError && aError.code && aError.code === "EAGAIN")
        {
            this.mErrorHandlers.HighWaterMarkWarning({
                Topic: aFormattedMessage[EPublishMessage.Topic],
                Nonce: Number(aFormattedMessage[EPublishMessage.Nonce]),
                Message: aFormattedMessage[EPublishMessage.Message],
            });
        }
        else
        {
            throw aError;
        }
    }

    private async ProcessPublish(): Promise<void>
    {
        const lNextSend: TPublishMessage | undefined = this.mPublishQueue.peek();

        if (lNextSend && this.mSafeToPublish)
        {
            const lFormattedMessage: string[] = lNextSend as string[];  // We replace the number with a string on the next line
            lFormattedMessage[EPublishMessage.Nonce] = lFormattedMessage[EPublishMessage.Nonce].toString();

            this.mPublishQueue.dequeue();
            this.mSafeToPublish = false;
            try
            {
                await this.mPublisher.send(lFormattedMessage);

                this.mTopicDetails.get(lFormattedMessage[EPublishMessage.Topic])!.LatestMessageTimestamp = Date.now();  // Update for the purposes of heartbeating
            }
            catch (aError)
            {
                this.HandleZMQPublishError(aError, lFormattedMessage);
            }
            this.mSafeToPublish = true;

            this.ProcessPublish();
        }
    }

    private QueuePublish(aMessage: TPublishMessage): void
    {
        this.mPublishQueue.enqueue(aMessage);
        this.ProcessPublish();
    }

    public Close(): void
    {
        this.mResponse.Close();
        clearTimeout(this.mHeartbeatTimeout!);

        this.mMessageCaches.forEach((aCache: ExpiryMap<number, TPublishMessage>) =>
        {
            aCache.clear();
        });

        this.mPublisher.linger = 0;
        this.mPublisher.close();
        this.mPublisher = undefined!;
    }

    public async Open(): Promise<void>
    {
        this.mResponse = new ZMQResponse(this.mEndpoint.RequestAddress, this.HandleRequest);
        this.mPublisher = new zmq.Publisher;
        this.mPublisher.noDrop = true;
        await this.mPublisher.bind(this.mEndpoint.PublisherAddress);

        this.CheckHeartbeats();
    }

    public Publish(aTopic: string, aData: string): void
    {
        let lCache: ExpiryMap<number, TPublishMessage> | undefined = this.mMessageCaches.get(aTopic);
        if (!lCache)
        {
            lCache = new ExpiryMap(3 * Config.MaximumLatency);
            this.mMessageCaches.set(aTopic, lCache);
        }

        let lTopicDetails: TTopicDetails | undefined = this.mTopicDetails.get(aTopic);
        if (!lTopicDetails)
        {
            lTopicDetails =
            {
                LatestMessageNonce: -1,
                LatestMessageTimestamp: -1,
            };
            this.mTopicDetails.set(aTopic, lTopicDetails);
        }

        const lMessageNonce: number = ++lTopicDetails.LatestMessageNonce;
        const lMessage: TPublishMessage =
        [
            aTopic,
            EMessageType.PUBLISH,
            lMessageNonce,
            aData,
        ];
        lCache.set(lMessageNonce, lMessage);
        lTopicDetails.LatestMessageTimestamp = Date.now();

        this.QueuePublish(lMessage);
    }
}

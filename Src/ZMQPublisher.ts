import * as zmq from "zeromq";
import { MessageLike } from "zeromq";
import { DUMMY_ENDPOINTS, EEndpoint, MAXIMUM_LATENCY } from "./Constants";
import { TEndpointAddresses } from "./Interfaces";
import ExpiryMap from "./Utils/ExpiryMap";
import JSONBigInt from "./Utils/JSONBigInt";
import { ZMQResponse } from "./ZMQResponse";

const CACHE_EXPIRY_MS: number = 3 * MAXIMUM_LATENCY;    // HEARTBEAT_TIME + PUBLISH_TIME + REQUEST_TIME
const CACHE_ERROR: string = "PUBLISHER ERROR: MESSAGE NOT IN CACHE";
const BAD_REQUEST_ERROR: string = "BAD REQUEST: TOPIC DOES NOT EXIST";

export class ZMQPublisher
{
    private mMessageCaches: Map<string, Map<bigint, MessageLike | MessageLike[]>> = new Map();

    private mNonce: bigint = 0n;
    private mPublisher!: zmq.Publisher;

    private readonly mPublisherEndpoint: EEndpoint;
    private mReplier: ZMQResponse;

    public constructor(aEndpoint: EEndpoint)
    {
        this.mPublisherEndpoint = aEndpoint;

        this.mReplier = new ZMQResponse(DUMMY_ENDPOINTS[aEndpoint].RequestAddress, this.HandleRequest);
    }

    private get Nonce(): bigint
    {
        return ++this.mNonce;
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

        const lMessageNonce: bigint = this.Nonce;
        const lMessage: string[] = [aTopic, lMessageNonce.toString(), JSONBigInt.Stringify(aData)];
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

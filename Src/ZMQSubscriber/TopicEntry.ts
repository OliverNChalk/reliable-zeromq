import { NonceMap } from "../Utils/NonceMap";
import { TSubscriptionCallback, TSubscriptionEndpoints } from "./ZMQSubscriber";

type TRecoveryHandler = (aEndpoint: TSubscriptionEndpoints, aTopic: string, aMessageIds: number[]) => void;

export default class TopicEntry
{
    private readonly mCallbacks: Map<number, TSubscriptionCallback> = new Map();
    private readonly mEndpoint: TSubscriptionEndpoints;
    private readonly mRecoveryHandler: TRecoveryHandler;
    private readonly mTopic: string;
    private mNonce: number = -1;
    private mNonceMap: NonceMap = new NonceMap();

    public constructor(aEndpoint: TSubscriptionEndpoints, aTopic: string, aRecoveryHandler: TRecoveryHandler)
    {
        this.mEndpoint = aEndpoint;
        this.mRecoveryHandler = aRecoveryHandler;
        this.mTopic = aTopic;
    }

    public get Callbacks(): Map<number, TSubscriptionCallback>
    {
        return this.mCallbacks;
    }

    public get Nonce(): number
    {
        return this.mNonce;
    }

    public ProcessHeartbeatMessage(aHeartbeatNonce: number): void
    {
        const lLastSeenNonce: number = this.mNonce;

        if (aHeartbeatNonce > lLastSeenNonce)
        {
            const lFirstMissingId: number = lLastSeenNonce + 1;
            const lLastMissingId: number = aHeartbeatNonce;

            const lMissingNonces: number[] = [];
            for (let i: number = lFirstMissingId; i <= lLastMissingId; ++i)
            {
                lMissingNonces.push(i);
            }

            this.mRecoveryHandler(this.mEndpoint, this.mTopic, lMissingNonces);
            this.mNonce = aHeartbeatNonce;
        }
    }

    public ProcessPublishMessage(aReceivedNonce: number, aMessage: string): void
    {
        /*
            TODO: Performance optimizations & refactoring:
             - Allow batched nonce import, this will be useful for recovery requests
             - Try and simplify the checking of newly inserted nonces, away from the dual mNonce and mNonceMap system
               - Note that we don't want to call ZMQRequest.Send() multiple times because Send() already has retries in-
                 built.
        */
        const lLastSeenNonce: number = this.mNonce;
        const lExpectedNonce: number = lLastSeenNonce + 1;

        if (aReceivedNonce >= lExpectedNonce)
        {
            this.mNonce = aReceivedNonce;
        }

        if (!this.mNonceMap.Has(aReceivedNonce))
        {
            this.mCallbacks.forEach((aSubscriber: TSubscriptionCallback) =>
            {
                aSubscriber(aMessage);
            });

            this.mNonceMap.Insert(aReceivedNonce);
            this.mNonceMap.GarbageClean();
        }

        if (aReceivedNonce > lExpectedNonce)
        {
            const lStart: number = lExpectedNonce;
            const lEnd: number = aReceivedNonce - 1;

            const lMissingNonces: number[] = [];
            for (let i: number = lStart; i <= lEnd; ++i)
            {
                lMissingNonces.push(i);
            }

            this.mRecoveryHandler(this.mEndpoint, this.mTopic, lMissingNonces);
        }
    }
}

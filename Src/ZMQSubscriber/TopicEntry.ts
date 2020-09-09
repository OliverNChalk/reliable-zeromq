import { SubscriptionCallback, TSubscriptionEndpoints } from "./ZMQSubscriber";

type TRecoveryHandler = (aEndpoint: TSubscriptionEndpoints, aTopic: string, aMessageIds: number[]) => void;

export default class TopicEntry
{
    private readonly mCallbacks: Map<number, SubscriptionCallback> = new Map();
    private readonly mEndpoint: TSubscriptionEndpoints;
    private readonly mRecoveryHandler: TRecoveryHandler;
    private mNonce: number = 0;

    public constructor(aEndpoint: TSubscriptionEndpoints, aRecoveryHandler: TRecoveryHandler)
    {
        this.mEndpoint = aEndpoint;
        this.mRecoveryHandler = aRecoveryHandler;
    }

    public get Callbacks(): Map<number, SubscriptionCallback>
    {
        return this.mCallbacks;
    }

    public get Nonce(): number
    {
        return this.mNonce;
    }

    public ProcessHeartbeatMessage(
        aEndpoint: TSubscriptionEndpoints,
        aTopic: string,
        aHeartbeatNonce: number,
    ): void
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

            this.mRecoveryHandler(this.mEndpoint, aTopic, lMissingNonces);
            this.mNonce = aHeartbeatNonce;
        }
    }

    public ProcessPublishMessage(
        aEndpoint: TSubscriptionEndpoints,
        aTopic: string,
        aReceivedNonce: number,
    ): void
    {
        const lLastSeenNonce: number = this.mNonce;

        if (aReceivedNonce === lLastSeenNonce + 1)
        {
            this.mNonce = aReceivedNonce;
        }
        else if (aReceivedNonce > lLastSeenNonce + 1)
        {
            const lStart: number = lLastSeenNonce + 1;
            const lEnd: number = aReceivedNonce - 1;

            const lMissingNonces: number[] = [];
            for (let i: number = lStart; i <= lEnd; ++i)
            {
                lMissingNonces.push(i);
            }

            this.mRecoveryHandler(this.mEndpoint, aTopic, lMissingNonces);
            this.mNonce = aReceivedNonce;
        }
    }
}

import { Queue } from "typescript-collections";

const EXPIRY_BUFFER: number = 500;  // Addresses potential rounding issues and encourages batching

type TExpiryEntry<K> =
{
    Key: K;
    Expiry: number;
};

export default class ExpiryMap<K, V> extends Map<K, V>
{
    private readonly mExpiryMS: number;
    private mNextExpiry: NodeJS.Timeout | undefined;

    private mExpiryQueue: Queue<TExpiryEntry<K>> = new Queue<TExpiryEntry<K>>();

    public constructor(aExpiryMS: number, aEntries?: Iterable<readonly [K, V]>)
    {
        super();
        this.mExpiryMS = aExpiryMS;

        if (aEntries)
        {
            for (const aEntry of aEntries)
            {
                this.set(aEntry[0], aEntry[1]);
            }
        }
    }

    private AddKeyToQueue(aKey: K): void
    {
        this.mExpiryQueue.add(
            {
                Key: aKey,
                Expiry: Date.now() + this.mExpiryMS,
            },
        );
    }

    private PruneStale = (): void =>
    {
        delete (this.mNextExpiry);
        const lStaleTime: number = Date.now();

        // PERF: Can optimize with for() & break on undefined
        while (this.mExpiryQueue.size() > 0 && lStaleTime >= this.mExpiryQueue.peek()!.Expiry)
        {
            const lKey: K = this.mExpiryQueue.dequeue()!.Key;

            super.delete(lKey);
        }

        if (this.mExpiryQueue.size() > 0)
        {
            const lNextExpiry: number = this.mExpiryQueue.peek()!.Expiry - Date.now() + EXPIRY_BUFFER;

            this.mNextExpiry = setTimeout(this.PruneStale, lNextExpiry);    // setTimeout has its own range check
        }
    }

    public set(key: K, value: V): this
    {
        // KNOWN ISSUE: Overwriting an already set value will not reset the expiry
        super.set(key, value);

        this.AddKeyToQueue(key);
        if (!this.mNextExpiry)
        {
            this.mNextExpiry = setTimeout(this.PruneStale, this.mExpiryMS + EXPIRY_BUFFER);
        }

        return this;
    }
}

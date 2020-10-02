export const Delay = (aMS: number = 100): Promise<void> =>
{
    return new Promise((aResolve: () => void): void =>
    {
       setTimeout(aResolve, aMS);
    });
};

export class CancelDelay
{
    private mNonce: number = 0;
    private mTimeoutMap: Map<number, NodeJS.Timeout> = new Map();

    public constructor()
    {}

    public Clear(): void
    {
        this.mTimeoutMap.forEach((aTimeout: NodeJS.Timeout) =>
        {
            clearTimeout(aTimeout);
        });
    }

    public Create(aMS: number = 100): Promise<void>
    {
        return new Promise((aResolve: () => void): void =>
        {
            const lNonce: number = ++this.mNonce;

            const lTimeoutMap: Map<number, NodeJS.Timeout> = this.mTimeoutMap;
            this.mTimeoutMap.set(lNonce, setTimeout(function(): void { aResolve(); lTimeoutMap.delete(lNonce); }, aMS));
        });
    }
}

// Cancellable Delay:
type TPromiseFulfilled<TResult> = (((value: void) => (PromiseLike<TResult> | TResult)) | undefined | null);
type TPromiseRejected<TResult> = ((reason: any) => (PromiseLike<TResult> | TResult)) | undefined | null;

export interface ICancellableDelay
{
    Resolve(): void;
    then(aOnFulfilled?: TPromiseFulfilled<void>, aOnRejected?: TPromiseRejected<never>): Promise<void | never>;
}

class CancellableDelayInstance implements ICancellableDelay
{
    private readonly mPromise: Promise<void>;
    private readonly mTimeout: NodeJS.Timeout;

    public constructor(aPromise: Promise<void>, aTimeout: NodeJS.Timeout)
    {
        this.mPromise = aPromise;
        this.mTimeout = aTimeout;
    }

    public Resolve(): void
    {
        clearTimeout(this.mTimeout);
    }

    public then<TResult1 = void, TResult2 = never>(
        aOnFulfilled?: TPromiseFulfilled<TResult1>,
        aOnRejected?: TPromiseRejected<TResult2>,
    ): Promise<TResult1 | TResult2>
    {
        return this.mPromise.then(aOnFulfilled, aOnRejected);
    }
}

export function CancellableDelay(aMS: number = 100): ICancellableDelay
{
    let lTimeout: NodeJS.Timeout;
    const lPromise: Promise<void> = new Promise<void>((aResolve: any, aReject: any): void =>
    {
        lTimeout = setTimeout(aResolve, aMS);
    });

    return new CancellableDelayInstance(lPromise, lTimeout!);
}

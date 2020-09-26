export const Delay = (aMS: number = 100): Promise<void> =>
{
    return new Promise((aResolve: () => void): void =>
    {
       setTimeout(aResolve, aMS);
    });
};

// Cancellable Delay:
type TPromiseFinally = ((() => void) | undefined | null);
type TPromiseFulfilled<TResult> = (((value: void) => (PromiseLike<TResult> | TResult)) | undefined | null);
type TPromiseRejected<TResult> = ((reason: any) => (PromiseLike<TResult> | TResult)) | undefined | null;
export interface ICancellableDelay extends Promise<void>
{
    Reject(): void;
    Resolve(): void;
}

class CancellableDelayInstance implements ICancellableDelay
{
    private readonly mPromise: Promise<void>;
    private readonly mReject: any;
    private readonly mResolve: any;
    private readonly mTimeout: any;

    public constructor(aPromise: Promise<void>, aResolve: any, aReject: any, aTimeout: any)
    {
        this.mPromise = aPromise;
        this.mResolve = aResolve;
        this.mReject = aReject;
        this.mTimeout = aTimeout;
    }

    public [Symbol.toStringTag]: string = "[object Promise]";

    public catch<TResult = never>(onRejected?: TPromiseRejected<TResult>): Promise<void | TResult>
    {
        return this.mPromise.catch(onRejected);
    }

    public finally(aOnFinally?: TPromiseFinally): Promise<void>
    {
        return this.mPromise.finally(aOnFinally);
    }

    public Reject(): void
    {
        clearTimeout(this.mTimeout);
        this.mReject();
    }

    public Resolve(): void
    {
        clearTimeout(this.mTimeout);
        this.mResolve();
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
    let lResolve: any;
    let lReject: any;
    let lTimeout: any;
    const lPromise: Promise<void> = new Promise<void>((aResolve: any, aReject: any): void =>
    {
        lResolve = aResolve;
        lReject = aReject;

        lTimeout = setTimeout(aResolve, aMS);
    });

    return new CancellableDelayInstance(lPromise, lResolve, lReject, lTimeout);
}

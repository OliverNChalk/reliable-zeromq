
export const Delay = (aMS: number = 100): Promise<void> =>
{
    return new Promise((aResolve: () => void): void =>
    {
       setTimeout(aResolve, aMS);
    });
};

export class CancellableDelay extends Promise<void>
{
    private mResolve!: () => void;
    private mReject!: () => void;

    public constructor(aMS: number = 100)
    {
        const Executor = (aResolve: () => void, aReject: () => void): void =>
        {
            this.mResolve = aResolve;
            this.mReject = aReject;
            setTimeout(aResolve, aMS);
        };

        super(Executor);
    }

    public EarlyReject(): void
    {
        this.mReject();
    }

    public EarlyResolve(): void
    {
        this.mResolve();
    }
}

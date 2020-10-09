export function Delay(aMS: number = 100): Promise<void>
{
    return new Promise((aResolve: () => void): void =>
    {
       setTimeout(aResolve, aMS);
    });
}

export class CancellableDelay
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

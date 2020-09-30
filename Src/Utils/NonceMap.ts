/*
    NonceMap is a dynamic array that allows for efficient detection of gaps in a stream of nonces. We essentially store
    all nonces ever inserted but batch any nonces that extend consecutively from the zero index. i.e. if we have nonces
    0, 1, 2, 4, we will only store [undefined, 4] and save 3 as our mBaseNonce. So if we receive 3, it will be inserted
    at index 0 and garbage cleaning will recognize that as continuing the consecutive chain from the original 0 index,
    so we will once again shrink the array to [] (4 is also received and continuing the chain).

    Under good network conditions we are not storing any nonces in our mNonceArray because nonces should be equal to the
    previous nonce + 1.

    ASSUMPTION: A 0 nonce will be inserted via NonceMap.Insert(0) to start the chain of consecutive nonces. You
    cannot start the chain from 1 or something else non-zero. If you need to start from n, insert all the nonces
    [0 ... n] one at a time.
 */

export class NonceMap
{
    private mBaseNonce: number = 0;
    private mNonceArray: (boolean | undefined)[] = [];

    public constructor()
    {}

    private InNonceArray(aNonce: number): boolean
    {
        return this.mNonceArray[aNonce - this.mBaseNonce] ?? false;
    }

    public GarbageClean(): void
    {
        while (this.mNonceArray[0])
        {
            this.mNonceArray.shift();   // Remove the front nonce
            ++this.mBaseNonce;          // Increase the offset for newly inserted nonces
        }
    }

    public Has(aNonce: number): boolean
    {
        return aNonce < this.mBaseNonce || this.InNonceArray(aNonce);
    }

    public Insert(aNonce: number): void
    {
        if (aNonce === this.mBaseNonce)
        {
            ++this.mBaseNonce;
            this.mNonceArray.shift();
        }
        else
        {
            this.mNonceArray[aNonce - this.mBaseNonce] = true;
        }
    }
}

export default async function WaitFor(aCondition: () => boolean): Promise<void>
{
    let lIteration: number = 0;
    while (!aCondition() && lIteration < 100)
    {
        await setImmediate((): void => {});
        ++lIteration;
    }

    if (lIteration === 100)
    {
        throw new Error("MAX WaitFor Iterations Reached");
    }
}

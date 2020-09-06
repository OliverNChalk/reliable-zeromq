export async function AsyncTools(aCondition: () => boolean): Promise<void>
{
    let lIteration: number = 0;
    while (!aCondition() && lIteration < 100)
    {
        await Promise.resolve();
        ++lIteration;
    }

    if (lIteration === 100)
    {
        throw new Error("MAX WaitFor Iterations Reached");
    }
}

export async function YieldToEventLoop(aIterations: number = 10): Promise<void>
{
    for (let i: number = 0; i < aIterations; ++i)
    {
        await Promise.resolve();
    }
}

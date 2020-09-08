export async function YieldToEventLoop(aIterations: number = 10): Promise<void>
{
    for (let i: number = 0; i < aIterations; ++i)
    {
        await Promise.resolve();
    }
}

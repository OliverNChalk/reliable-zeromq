import { PerfTest } from "perf-test";
import { CancellableDelay, Delay } from "../../Src/Utils/Delay";

function SynchronousDelay(): Promise<void>
{
    return Delay(0);
}

async function SynchronousDelay1_000(): Promise<void>
{
    const lPromise: Promise<void>[] = [];
    for (let i: number = 0; i < 1_000; ++i)
    {
        lPromise.push(Delay(0));
    }

    await Promise.all(lPromise);
}

async function SynchronousDelay25_000(): Promise<void>
{
    const lPromise: Promise<void>[] = [];
    for (let i: number = 0; i < 25_000; ++i)
    {
        lPromise.push(Delay(0));
    }

    await Promise.all(lPromise);
}

function SynchronousCancellableDelay(): Promise<void>
{
    return CancellableDelay(0);
}

async function SynchronousCancellableDelay1_000(): Promise<void>
{
    const lPromise: Promise<void>[] = [];
    for (let i: number = 0; i < 1_000; ++i)
    {
        lPromise.push(CancellableDelay(0));
    }

    await Promise.all(lPromise);
}

async function SynchronousCancellableDelay25_000(): Promise<void>
{
    const lPromise: Promise<void>[] = [];
    for (let i: number = 0; i < 25_000; ++i)
    {
        lPromise.push(CancellableDelay(0));
    }

    await Promise.all(lPromise);
}

const lBenchmarks: PerfTest[] =
[
    new PerfTest(
        {
            Name: "Delay > Synchronous [ 1 ]",
            Function: SynchronousDelay,
            FunctionReturnsPromise: true,
            Console: true,
        },
    ),
    new PerfTest(
        {
            Name: "Delay > Synchronous [ 1000 ]",
            Function: SynchronousDelay1_000,
            FunctionReturnsPromise: true,
            Console: true,
        },
    ),
    new PerfTest(
        {
            Name: "Delay > Synchronous [ 25000 ]",
            Function: SynchronousDelay25_000,
            FunctionReturnsPromise: true,
            Console: true,
        },
    ),
    new PerfTest(
        {
            Name: "CancellableDelay > Synchronous [ 1 ]",
            Function: SynchronousCancellableDelay,
            FunctionReturnsPromise: true,
            Console: true,
        },
    ),
    new PerfTest(
        {
            Name: "CancellableDelay > Synchronous [ 1000 ]",
            Function: SynchronousCancellableDelay1_000,
            FunctionReturnsPromise: true,
            Console: true,
        },
    ),
    new PerfTest(
        {
            Name: "CancellableDelay > Synchronous [ 25000 ]",
            Function: SynchronousCancellableDelay25_000,
            FunctionReturnsPromise: true,
            Console: true,
        },
    ),
];

async function RunTests(aBenchmarks: PerfTest[]): Promise<void>
{
    for (let i: number = 0; i < aBenchmarks.length; ++i)
    {
        await aBenchmarks[i].Run();
    }
}

RunTests(lBenchmarks);

import { PerfTest } from "simple-perf";
import { CancelDelay, CancellableDelay, Delay, ICancellableDelay } from "../../Src/Utils/Delay";

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

function SynchronousCancelDelay(): Promise<void>
{
    return new CancelDelay().Create(0);
}

async function SynchronousCancelDelay1_000(): Promise<void>
{
    const lCancelDelay: CancelDelay = new CancelDelay();
    const lPromise: Promise<void>[] = [];
    for (let i: number = 0; i < 1_000; ++i)
    {
        lPromise.push(lCancelDelay.Create(0));
    }

    await Promise.all(lPromise);
}

async function SynchronousCancelDelay25_000(): Promise<void>
{
    const lCancelDelay: CancelDelay = new CancelDelay();
    const lPromise: Promise<void>[] = [];
    for (let i: number = 0; i < 25_000; ++i)
    {
        lPromise.push(lCancelDelay.Create(0));
    }

    await Promise.all(lPromise);
}

function SynchronousCancellableDelay(): ICancellableDelay
{
    return CancellableDelay(0);
}

async function SynchronousCancellableDelay1_000(): Promise<void>
{
    const lPromise: ICancellableDelay[] = [];
    for (let i: number = 0; i < 1_000; ++i)
    {
        lPromise.push(CancellableDelay(0));
    }

    await Promise.all(lPromise as any);
}

async function SynchronousCancellableDelay25_000(): Promise<void>
{
    const lPromise: ICancellableDelay[] = [];
    for (let i: number = 0; i < 25_000; ++i)
    {
        lPromise.push(CancellableDelay(0));
    }

    await Promise.all(lPromise as any);
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
            Name: "CancelDelay > Synchronous [ 1 ]",
            Function: SynchronousCancelDelay,
            FunctionReturnsPromise: true,
            Console: true,
        },
    ),
    new PerfTest(
        {
            Name: "CancelDelay > Synchronous [ 1000 ]",
            Function: SynchronousCancelDelay1_000,
            FunctionReturnsPromise: true,
            Console: true,
        },
    ),
    new PerfTest(
        {
            Name: "CancelDelay > Synchronous [ 25000 ]",
            Function: SynchronousCancelDelay25_000,
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

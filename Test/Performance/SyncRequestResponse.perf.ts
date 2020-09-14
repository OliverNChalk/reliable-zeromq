import Benchmark from "benchmark";
import { performance } from "perf_hooks";
import { Delay } from "../../Src/Utils/Delay";
import { TRequestResponse, ZMQRequest } from "../../Src/ZMQRequest";
import { ZMQResponse } from "../../Src/ZMQResponse";
import Endpoint from "../Helpers/Endpoint";

const lTestEndpoint: string = Endpoint.GetEndpoint("RequestResponsePerformance");

const lAsyncFunction = async(): Promise<string> =>
{
    return "ImmediateResult";
};

const lSyncFunction = (): Promise<string> =>
{
    return Promise.resolve("ImmediateResult");
};

function lDeclaredSyncFunction(): Promise<string>
{
    return Promise.resolve("ImmediateResult");
}

async function DeclaredAsyncFunction(): Promise<string>
{
    return "ImmediateResult";
}

const lIterations: number = 10_000;
async function SyncRequestResponse(): Promise<void>
{
    const lResponderServer: ZMQResponse = new ZMQResponse(lTestEndpoint, lAsyncFunction);
    const lRequester: ZMQRequest = new ZMQRequest(lTestEndpoint);

    const lStartTime: number = performance.now();
    for (let i: number = 0; i < lIterations; ++i)
    {
        const lResult: TRequestResponse = await lRequester.Send("PerfRequest");
    }
    const lTimeTaken: number = performance.now() - lStartTime;

    process.stdout.write([
        (1000 / lTimeTaken) * lIterations, "ops/s",
        "SyncRequestResponse",
        lTimeTaken.toLocaleString(undefined, {maximumFractionDigits: 17}), "ms,",
        process.memoryUsage().rss / 1024 / 1024, "MB memory",
    ].join(" ") + "\n");

    lResponderServer.Close();
    lRequester.Close();
}

async function SyncRequestResponseOptimized(): Promise<void>
{
    const lResponderServer: ZMQResponse = new ZMQResponse(lTestEndpoint, lSyncFunction);
    const lRequester: ZMQRequest = new ZMQRequest(lTestEndpoint);

    const lStartTime: number = performance.now();
    for (let i: number = 0; i < lIterations; ++i)
    {
        const lResult: TRequestResponse = await lRequester.Send("PerfRequest");
    }
    const lTimeTaken: number = performance.now() - lStartTime;

    process.stdout.write([
        (1000 / lTimeTaken) * lIterations, "ops/s",
        "SyncRequestResponseOptimized",
        lTimeTaken.toLocaleString(undefined, {maximumFractionDigits: 17}), "ms,",
        process.memoryUsage().rss / 1024 / 1024, "MB memory",
    ].join(" ") + "\n");

    lResponderServer.Close();
    lRequester.Close();
}

async function DeclaredSyncRequestResponseOptimized(): Promise<void>
{
    const lResponderServer: ZMQResponse = new ZMQResponse(lTestEndpoint, lDeclaredSyncFunction);
    const lRequester: ZMQRequest = new ZMQRequest(lTestEndpoint);

    const lStartTime: number = performance.now();
    for (let i: number = 0; i < lIterations; ++i)
    {
        const lResult: TRequestResponse = await lRequester.Send("PerfRequest");
    }
    const lTimeTaken: number = performance.now() - lStartTime;

    process.stdout.write([
        (1000 / lTimeTaken) * lIterations, "ops/s",
        "DeclaredSyncRequestResponseOptimized",
        lTimeTaken.toLocaleString(undefined, {maximumFractionDigits: 17}), "ms,",
        process.memoryUsage().rss / 1024 / 1024, "MB memory",
    ].join(" ") + "\n");

    lResponderServer.Close();
    lRequester.Close();
}

function AsyncRequestResponse(deferred: Promise<void>): void
{
    // @ts-ignore
    lRequester.Send("PerfRequest")
        // @ts-ignore
        .then(() => deferred.resolve());
}

async function RunTests(): Promise<void>
{
    const lResponderServer: ZMQResponse = new ZMQResponse(lTestEndpoint, lDeclaredSyncFunction);
    const lRequester: ZMQRequest = new ZMQRequest(lTestEndpoint);
    // @ts-ignore
    global.lRequester = lRequester;
    const bench: any = new Benchmark(
        "DeclaredAsyncRequestResponseOptimized",
        {
            defer: true,
            fn: AsyncRequestResponse,
            onComplete: (aAny: any): void =>
            {
                lResponderServer.Close();
                lRequester.Close();

                console.log("Done");
                console.log(aAny);
            },
        },
    );

    bench.run({ async: true });
    setTimeout(() => { console.log(bench); }, 5000);
}

RunTests();

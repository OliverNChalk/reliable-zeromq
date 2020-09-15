import { PerfTest } from "perf-test";
import { Delay } from "../../Src/Utils/Delay";
import { ZMQRequest } from "../../Src/ZMQRequest";
import { ZMQResponse } from "../../Src/ZMQResponse";
import TestEndpoint from "../Helpers/TestEndpoint";

const lTestEndpoint: string = TestEndpoint.GetEndpoint("RequestResponsePerformance");
const lRequester: ZMQRequest = new ZMQRequest(lTestEndpoint);
const lResponder: ZMQResponse = new ZMQResponse(lTestEndpoint, Responder);

function Responder(): Promise<string>
{
    return Promise.resolve("ImmediateResult");
}

function Requester(): Promise<any>
{
    return lRequester.Send("PerfRequest");
}

const lBenchmarks: PerfTest[] =
[
    new PerfTest(
        {
            Name: "SyncRequestResponse",
            Function: Requester,
            FunctionReturnsPromise: true,
            Console: true,
            State: [
                { Key: "lRequester", Value: lRequester },
            ],
        },
    ),
    new PerfTest(
        {
            Name: "SyncRequestResponse",
            Function: Requester,
            FunctionReturnsPromise: true,
            Console: true,
            State: [
                { Key: "lRequester", Value: lRequester },
            ],
        },
    ),
];

async function RunTests(aBenchmarks: PerfTest[]): Promise<void>
{
    await Delay(100);

    for (let i: number = 0; i < aBenchmarks.length; ++i)
    {
        await aBenchmarks[i].Run();
    }

    lResponder.Close();
    lRequester.Close();
}

RunTests(lBenchmarks);

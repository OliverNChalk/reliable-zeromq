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

const lPerfTest: PerfTest = new PerfTest(
    {
        Name: "SyncRequestResponse",
        Function: Requester,
        FunctionReturnsPromise: true,
        Console: true,
        State: [
            { Key: "lRequester", Value: lRequester },
        ],
    },
);

const lBench: PerfTest = new PerfTest(
    {
        Name: "AsyncRequestResponse",
        Function: Requester,
        FunctionReturnsPromise: true,
        Console: true,
        State: [
            { Key: "lRequester", Value: lRequester },
        ],
    },
);

Delay(200)
    .then(() =>
    {
        lPerfTest.Run()
            .then(() =>
                {
                    lBench.Run()
                        .then(() =>
                        {
                            lRequester.Close();
                            lResponder.Close();
                        });
                },
            );
    });

import { PerfTest } from "simple-perf";
import { Delay } from "../../Src/Utils/Delay";
import { ZMQPublisher } from "../../Src/ZMQPublisher";
import { ZMQSubscriber } from "../../Src/ZMQSubscriber/ZMQSubscriber";
import TestEndpoint from "../Helpers/TestEndpoint";

const lPublishEndpoint: string = TestEndpoint.GetEndpoint("PublishPerformance");
const lRecoveryEndpoint: string = TestEndpoint.GetEndpoint("PublishRecoveryPerformance");
const lPublisher: ZMQPublisher = new ZMQPublisher(
    {
        PublisherAddress: lPublishEndpoint,
        RequestAddress: lRecoveryEndpoint,
    },
);
const lSubscriber: ZMQSubscriber = new ZMQSubscriber();

let lCallback: (aMessage: string) => void = undefined!;
function Resolver(aMessage: string): void
{
    lCallback(aMessage);
}
lSubscriber.Subscribe(
    {
        PublisherAddress: lPublishEndpoint,
        RequestAddress: lRecoveryEndpoint,
    },
    "PerfTest",
    Resolver,
);

function PublishReceive(): Promise<void>
{
    lPublisher.Publish("PerfTest", "PerfData");

    return new Promise((aResolve: () => void): void =>
    {
        lCallback = aResolve;
    });
}

const lBenchmarks: PerfTest[] =
[
    new PerfTest(
        {
            Name: "PublishSubscribe > Synchronous Throughput",
            Function: PublishReceive,
            FunctionReturnsPromise: true,
            Console: true,
            State: [
                { Key: "lPublisher", Value: lPublisher },
            ],
        },
    ),
];

async function RunTests(aBenchmarks: PerfTest[]): Promise<void>
{
    await lPublisher.Open();
    await Delay(500);

    for (let i: number = 0; i < aBenchmarks.length; ++i)
    {
        await aBenchmarks[i].Run();
    }

    lSubscriber.Close();
    lPublisher.Close();
}

RunTests(lBenchmarks);

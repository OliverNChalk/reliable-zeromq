/* tslint:disable: no-string-literal */
import anyTest, { ExecutionContext } from "ava";
import type { TestInterface } from "ava";
import * as sinon from "sinon";
import { ImportMock, MockManager } from "ts-mock-imports";
import * as zmq from "zeromq";
import Config from "../../Src/Config";
import JSONBigInt from "../../Src/Utils/JSONBigInt";
import { ERequestBody, TRequestResponse, ZMQRequest } from "../../Src/ZMQRequest";
import { YieldToEventLoop } from "../Helpers/AsyncTools";

type TAsyncIteratorResult = { value: any; done: boolean };
type TTestContext =
{
    ResponderEndpoint: string;
    TestData: any[];
    DealerMock: MockManager<zmq.Dealer>;
    SUTCallback: (aMessage: TAsyncIteratorResult) => void;
    SendToReceiver: (aMessage: string[]) => void;
};

const test: TestInterface<TTestContext> = anyTest as TestInterface<TTestContext> ;

test.before((t: ExecutionContext<TTestContext>): void =>
{
    // Unnecessary
});

test.beforeEach((t: ExecutionContext<TTestContext>): void =>
{
    // tslint:disable-next-line:typedef
    const lNewIterator = (() =>
    {
        return {
            async next(): Promise<TAsyncIteratorResult>
            {
                return new Promise((resolve: (aValue: TAsyncIteratorResult) => void): void =>
                {
                    t.context.SUTCallback = resolve;
                });
            },
        };
    })();

    const lMockManager: MockManager<zmq.Dealer> = ImportMock.mockClass<zmq.Dealer>(zmq, "Dealer");
    // @ts-ignore
    lMockManager.mock(Symbol.asyncIterator, lNewIterator);

    t.context = {
        ResponderEndpoint: "tcp://127.0.0.1:3000",
        TestData: [
            {
                a: 100n,
                b: 20n, // JSONBigInt will parse "20n" to 20n, known issue
                c: 0.5,
                d: [
                    5n,
                    "myFunc()",
                ],
            },
        ],
        DealerMock: lMockManager,
        SUTCallback: null!,
        SendToReceiver: (aMessage: string[]): void =>
        {
            t.context.SUTCallback({ value: aMessage, done: false });
        },
    };
});

test.afterEach((t: ExecutionContext<TTestContext>): void =>
{
    sinon.restore();
    ImportMock.restore();
});

test.serial("Start, Send, Receive, Close", async(t: ExecutionContext<TTestContext>): Promise<void> =>
{
    const lDealerStub: MockManager<zmq.Dealer> = t.context.DealerMock;
    const lRequester: ZMQRequest = new ZMQRequest(t.context.ResponderEndpoint);
    t.is(lRequester.Endpoint, t.context.ResponderEndpoint);

    lDealerStub.mock("connect", undefined);
    const lSendMock: sinon.SinonStub = lDealerStub.mock("send", Promise.resolve());

    const lRequestPromise: Promise<TRequestResponse> = lRequester.Send(JSONBigInt.Stringify(t.context.TestData));
    await YieldToEventLoop();

    let lCallCount: number = 0;
    t.is(lSendMock.callCount, ++lCallCount);
    t.deepEqual(
        lSendMock.getCall(lCallCount - 1).args[0],
        [
            lRequester["mOurUniqueId"],
            "0",
            JSONBigInt.Stringify(t.context.TestData),
        ],
    );

    const lResponse: string[] =
    [
        "0",
        "dummy message",
    ];
    t.context.SendToReceiver(lResponse);

    const lPromiseResult: TRequestResponse = await lRequestPromise;
    t.deepEqual(lPromiseResult, lResponse[1]);

    lRequester.Close();
});

test.serial("Degraded Connection", async(t: ExecutionContext<TTestContext>): Promise<void> =>
{
    const clock: sinon.SinonFakeTimers = sinon.useFakeTimers();
    const lDealerStub: MockManager<zmq.Dealer> = t.context.DealerMock;
    const lRequester: ZMQRequest = new ZMQRequest(t.context.ResponderEndpoint);

    t.is(lRequester.Endpoint, t.context.ResponderEndpoint);

    lDealerStub.mock("connect", undefined);
    lDealerStub.mock("send", Promise.resolve());

    const lRequestPromise: Promise<TRequestResponse> = lRequester.Send(JSONBigInt.Stringify(t.context.TestData));
    const lResponse: string[] =
    [
        JSONBigInt.Stringify(0),
        "dummy message",
    ];

    // Send response with 500ms delay
    await YieldToEventLoop();   // Sinon timers don't seem super reliable at triggering timeouts
    clock.tick(501);
    await YieldToEventLoop();
    t.context.SendToReceiver(lResponse);

    const lPromiseResult: TRequestResponse = await lRequestPromise;

    t.is(lPromiseResult, lResponse[1]);

    const lSecondRequest: Promise<TRequestResponse> = lRequester.Send("MyTestDelayedResponse");
    const lSecondResponse: string[] =
    [
        JSONBigInt.Stringify(1),
        "another response",
    ];

    // Send 3 responses (2 duplicates) with 2200ms delay
    await YieldToEventLoop();
    clock.tick(501);
    await YieldToEventLoop();

    t.context.SendToReceiver(lSecondResponse);
    await YieldToEventLoop();   // Necessary to allow AsyncIterator.next() to be called and SendToReceiver to be setup
    t.context.SendToReceiver(lSecondResponse);
    await YieldToEventLoop();   // Necessary to allow AsyncIterator.next() to be called and SendToReceiver to be setup
    t.context.SendToReceiver(lSecondResponse);

    t.is(await lSecondRequest, lSecondResponse[1]);

    lRequester.Close();
});

test.serial("Error: Maximum Latency", async(t: ExecutionContext<TTestContext>): Promise<void> =>
{
    const clock: sinon.SinonFakeTimers = sinon.useFakeTimers();
    const lDealerStub: MockManager<zmq.Dealer> = t.context.DealerMock;
    const lRequester: ZMQRequest = new ZMQRequest(t.context.ResponderEndpoint);

    lDealerStub.mock("send", Promise.resolve());
    lDealerStub.mock("connect", undefined);

    const lFirstResponsePromise: Promise<TRequestResponse> = lRequester.Send(JSONBigInt.Stringify("hello"));

    t.context.SendToReceiver([JSONBigInt.Stringify(0), "world"]);

    clock.tick(500);

    t.is(await lFirstResponsePromise, "world");

    const lFailedRequest: Promise<TRequestResponse> = lRequester.Send(JSONBigInt.Stringify("hello"));
    await YieldToEventLoop();

    clock.tick(Config.MaximumLatency * 2 + 600);    // 500ms represents the polling interval in ZMQRequest
    await YieldToEventLoop();

    const lFailedResult: TRequestResponse = await lFailedRequest;

    if (typeof lFailedResult !== "string")
    {
        t.is(lFailedResult.RequestId, 1);
        t.is(lFailedResult.RequestBody[ERequestBody.Nonce], "1");
        t.is(lFailedResult.RequestBody[ERequestBody.Message], "\"hello\"");
    }
    else
    {
        t.fail("lFailedRequest should have resolved to TRequestTimeOut");
    }

    lRequester.Close();
});

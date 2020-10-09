/* tslint:disable: no-string-literal */
import type { TestInterface } from "ava";
import anyTest, { ExecutionContext } from "ava";
import * as sinon from "sinon";
import { ImportMock, MockManager } from "ts-mock-imports";
import * as zmq from "zeromq";
import Config from "../../Src/Config";
import { TRequestHwmWarning } from "../../Src/Errors";
import JSONBigInt from "../../Src/Utils/JSONBigInt";
import { ERequestBody, ERequestResponse, TRequestResponse, TSuccessfulRequest, ZMQRequest } from "../../Src/ZMQRequest";
import { RESPONSE_CACHE_EXPIRED } from "../../Src/ZMQResponse";
import { YieldToEventLoop } from "../Helpers/AsyncTools";

type TAsyncIteratorResult = { value: any; done: boolean };
type TTestContext =
{
    ResponderEndpoint: string;
    TestData: any[];
    DealerMock: MockManager<zmq.Dealer>;
    SendToReceiver: (aIndex: number, aMessage: [nonce: string, message: string]) => void;
};

const test: TestInterface<TTestContext> = anyTest as TestInterface<TTestContext>;

test.beforeEach((t: ExecutionContext<TTestContext>): void =>
{
    const lResolvers: ((aResolver: TAsyncIteratorResult) => void)[] = [];
    function FakeIterator(): { next(): Promise<TAsyncIteratorResult> }
    {
        return {
            async next(): Promise<TAsyncIteratorResult>
            {
                return new Promise((aResolve: (aValue: TAsyncIteratorResult) => void): void =>
                {
                    lResolvers.push(aResolve);
                });
            },
        };
    }

    const lMockManager: MockManager<zmq.Dealer> = ImportMock.mockClass<zmq.Dealer>(zmq, "Dealer");
    // @ts-ignore
    const lAsyncIteratorMock: sinon.SinonStub = lMockManager.mock(Symbol.asyncIterator);
    lAsyncIteratorMock.callsFake(FakeIterator);

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
        SendToReceiver: (aIndex: number, aMessage: string[]): void =>
        {
            lResolvers[aIndex]({value: aMessage, done: false});
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

    const lResponse: [string, string] =
    [
        "0",
        "dummy message",
    ];
    t.context.SendToReceiver(0, lResponse);

    const lPromiseResult: TRequestResponse = await lRequestPromise;
    t.deepEqual((lPromiseResult as TSuccessfulRequest).Response, lResponse[1]);

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
    const lResponse: [string, string] =
    [
        "0",
        "dummy message",
    ];

    // Send response with 500ms delay
    await YieldToEventLoop();   // Sinon timers don't seem super reliable at triggering timeouts
    clock.tick(501);
    await YieldToEventLoop();
    t.context.SendToReceiver(0, lResponse);

    const lPromiseResult: TRequestResponse = await lRequestPromise;

    t.is((lPromiseResult as TSuccessfulRequest).Response, lResponse[1]);

    const lSecondRequest: Promise<TRequestResponse> = lRequester.Send("MyTestDelayedResponse");
    const lSecondResponse: [string, string] =
    [
        "1",
        "another response",
    ];

    // Send 3 responses (2 duplicates) with 2200ms delay
    await YieldToEventLoop();
    clock.tick(501);
    await YieldToEventLoop();

    t.context.SendToReceiver(1, lSecondResponse);
    await YieldToEventLoop();
    t.context.SendToReceiver(2, lSecondResponse);
    await YieldToEventLoop();
    t.context.SendToReceiver(3, lSecondResponse);
    await YieldToEventLoop();

    t.is((await lSecondRequest as TSuccessfulRequest).Response, lSecondResponse[1]);

    lRequester.Close();
});

test.serial("Errors & Warns", async(t: ExecutionContext<TTestContext>): Promise<void> =>
{
    const clock: sinon.SinonFakeTimers = sinon.useFakeTimers();
    const lDealerStub: MockManager<zmq.Dealer> = t.context.DealerMock;
    const lEndpoint: string = t.context.ResponderEndpoint;

    const lHighWaterMarkWarnings: TRequestHwmWarning[] = [];
    const lRequester: ZMQRequest = new ZMQRequest(lEndpoint);

    const lRequesterCustom: ZMQRequest = new ZMQRequest(
        lEndpoint,
        {
            HighWaterMarkWarning: (aWarning: TRequestHwmWarning): void =>
            {
                lHighWaterMarkWarnings.push(aWarning);
            },
        },
    );

    lDealerStub.mock("send", Promise.resolve());
    lDealerStub.mock("connect", undefined);

    const lFirstResponsePromise: Promise<TRequestResponse> = lRequester.Send(JSONBigInt.Stringify("hello"));

    t.context.SendToReceiver(0, [JSONBigInt.Stringify(0), "world"]);

    clock.tick(500);

    t.is((await lFirstResponsePromise as TSuccessfulRequest).Response, "world");

    const lFailedRequest: Promise<TRequestResponse> = lRequester.Send(JSONBigInt.Stringify("hello"));
    await YieldToEventLoop();

    clock.tick(Config.MaximumLatency * 2 + 600);    // 500ms represents the polling interval in ZMQRequest
    await YieldToEventLoop();

    const lFailedResult: TRequestResponse = await lFailedRequest;

    if (lFailedResult.ResponseType === ERequestResponse.TIMEOUT)
    {
        t.is(lFailedResult.MessageNonce, 1);
        t.is(lFailedResult.RequestBody[ERequestBody.Nonce], "1");
        t.is(lFailedResult.RequestBody[ERequestBody.Message], "\"hello\"");
    }
    else
    {
        t.fail("lFailedRequest should have resolved to TRequestTimeOut");
    }

    lDealerStub.mock("send", Promise.reject(
        {
            code: "EAGAIN",
        },
    ));

    t.is(lHighWaterMarkWarnings.length, 0);

    const lDefaultWarnPromise: Promise<TRequestResponse> = lRequester.Send("THIS SHOULD BE SUPPRESSED");
    const lCustomWarnPromise: Promise<TRequestResponse> = lRequesterCustom.Send("THIS SHOULD PUSH TO ARRAY");
    await YieldToEventLoop();

    t.is(lHighWaterMarkWarnings.length, 1);
    t.deepEqual(
        lHighWaterMarkWarnings[0],
        {
            Requester: lRequesterCustom["mOurUniqueId"],
            Nonce: 0,
            Message: "THIS SHOULD PUSH TO ARRAY",
        },
    );

    lDealerStub.mock("send", Promise.resolve());

    t.context.SendToReceiver(2, ["2", "default errors response"]);
    await YieldToEventLoop();

    t.context.SendToReceiver(1, ["0", "custom errors response"]);
    await YieldToEventLoop();

    t.deepEqual(
        await lDefaultWarnPromise,
        {
            ResponseType: ERequestResponse.SUCCESS,
            Response: "default errors response",
        },
    );
    t.deepEqual(
        await lCustomWarnPromise,
        {
            ResponseType: ERequestResponse.SUCCESS,
            Response: "custom errors response",
        },
    );

    const lCacheError: Promise<TRequestResponse> = lRequester.Send("THIS SHOULD TRIGGER A CACHE ERROR");
    await YieldToEventLoop();

    t.context.SendToReceiver(3, ["3", RESPONSE_CACHE_EXPIRED]);
    await YieldToEventLoop();

    t.deepEqual(
        await lCacheError,
        {
            ResponseType: ERequestResponse.CACHE_ERROR,
            Endpoint: lEndpoint,
            MessageNonce: 3,
        },
    );

    lRequester.Close();
    lRequesterCustom.Close();
    await YieldToEventLoop();

    t.context.SendToReceiver(4, ["-10", "custom handler suppress"]);
    t.context.SendToReceiver(5, ["-10", "default handler suppress"]);

    await YieldToEventLoop();
});

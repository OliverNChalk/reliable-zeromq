/* tslint:disable: no-string-literal */
import anyTest, { ExecutionContext } from "ava";
import type { TestInterface } from "ava";
import * as sinon from "sinon";
import { ImportMock, MockManager } from "ts-mock-imports";
import * as zmq from "zeromq";
import { MAXIMUM_LATENCY } from "../Src/Constants";
import JSONBigInt from "../Src/Utils/JSONBigInt";
import { ZMQRequest } from "../Src/ZMQRequest";
import { ZMQResponse } from "../Src/ZMQResponse";

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

test.serial("Start, Send, Receive, Repeat", async(t: ExecutionContext<TTestContext>): Promise<void> =>
{
    const lDealerStub: MockManager<zmq.Dealer> = t.context.DealerMock;
    const lRequest: ZMQRequest = new ZMQRequest(t.context.ResponderEndpoint);

    lRequest.Start();

    lDealerStub.mock("send", Promise.resolve());
    const lResponsePromise: Promise<string> = lRequest.Send(JSONBigInt.Stringify(t.context.TestData));

    const lResponse: string[] =
    [
        JSONBigInt.Stringify(0),
        "dummy message",
    ];
    t.context.SendToReceiver(lResponse);

    const lPromiseResult: string = await lResponsePromise;

    t.is(lPromiseResult, lResponse[1]);

    lRequest.Stop();

    await t.throwsAsync(async(): Promise<void> =>
    {
        await lRequest.Send("this should throw");
    });

    lRequest.Start();
    const lNotThrowPromise: Promise<string> = lRequest.Send("this should not throw");

    t.context.SendToReceiver([JSONBigInt.Stringify(1), "all okay"]);
    const lNotThrowResult: string = await lNotThrowPromise;

    t.is(lNotThrowResult, "all okay");

    lRequest.Stop();
});

test.serial("Maximum Latency", async(t: ExecutionContext<TTestContext>): Promise<void> =>
{
    const clock: sinon.SinonFakeTimers = sinon.useFakeTimers();
    const lDealerStub: MockManager<zmq.Dealer> = t.context.DealerMock;
    const lRequest: ZMQRequest = new ZMQRequest(t.context.ResponderEndpoint);

    lRequest.Start();
    lDealerStub.mock("send", Promise.resolve());

    const lFirstResponsePromise: Promise<string> = lRequest.Send(JSONBigInt.Stringify("hello"));
    t.context.SendToReceiver([JSONBigInt.Stringify(0), "world"]);

    t.is(await lFirstResponsePromise, "world");

    const lSecondResponsePromise: Promise<string> = lRequest.Send(JSONBigInt.Stringify("hello"));

    clock.tick(1500);
    t.context.SendToReceiver([JSONBigInt.Stringify(1), "world"]);

    t.is(await lSecondResponsePromise, "world");

    const lThirdResponsePromise: Promise<string> = lRequest.Send("hello");
    await Promise.resolve();

    const lTickTime: number = 500;  // RESPONSE_TIMEOUT const
    for (let i: number = 0; i <= MAXIMUM_LATENCY * 2 + lTickTime; i += lTickTime)
    {
        clock.tick(lTickTime);
        await Promise.resolve();
    }

    await t.throwsAsync(lThirdResponsePromise);
});

test.serial("Networked: Start, Send, Receive, Repeat", async(t: ExecutionContext<TTestContext>): Promise<void> =>
{
    const lExpected: { code: string; data: any } =
    {
        code: "success",
        data: undefined!,
    };
    t.context.DealerMock.restore();
    const lResponse: ZMQResponse = new ZMQResponse(t.context.ResponderEndpoint, async(aMsg: string): Promise<string> =>
    {
        let lResult: string;
        try
        {
            lResult = JSONBigInt.Parse(aMsg);
        }
        catch (e)
        {
            lResult = aMsg as string;
        }

        return JSONBigInt.Stringify({
            code: "success",
            data: lResult,
        });
    });
    const lRequest: ZMQRequest = new ZMQRequest(t.context.ResponderEndpoint);

    lRequest.Start();
    await lResponse.Start();

    const lPromiseResult: string = await lRequest.Send(JSONBigInt.Stringify(t.context.TestData));
    lExpected.data = t.context.TestData;
    t.deepEqual(JSONBigInt.Parse(lPromiseResult), lExpected);

    lRequest.Stop();

    await t.throwsAsync(async(): Promise<void> =>
    {
        await lRequest.Send("this should throw");
    });

    lRequest.Start();
    const lNotThrowPromise: Promise<string> = lRequest.Send("this should not throw");

    const lNotThrowResult: string = await lNotThrowPromise;
    lExpected.data = "this should not throw";

    t.deepEqual(JSONBigInt.Parse(lNotThrowResult), lExpected);

    lRequest.Stop();
    lResponse.Stop();
});

test.todo("Error Case: Unregistered Message Caller");

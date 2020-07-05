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
};

const test: TestInterface<TTestContext> = anyTest as TestInterface<TTestContext> ;

test.before((t: ExecutionContext<TTestContext>): void =>
{
    // Unnecessary
});

test.beforeEach((t: ExecutionContext<TTestContext>): void =>
{
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
    };
});

test.afterEach((t: ExecutionContext<TTestContext>): void =>
{
    sinon.restore();
    ImportMock.restore();
});

test.serial("ZMQRequest: Start, Send, Receive, Repeat", async(t: ExecutionContext<TTestContext>): Promise<void> =>
{
    const lExpected: { code: string; data: any } =
    {
        code: "success",
        data: undefined!,
    };
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

test.serial("ZMQResponse: Start, Receive, Repeat", async(t: ExecutionContext<TTestContext>): Promise<void> =>
{
    let lResponder = async(aMsg: string): Promise<string> => "world";
    const lResponderRouter = (aMsg: string): Promise<string> =>
    {
        return lResponder(aMsg);    // Necessary so we can update lResponder throughout
    };

    const lRequest: ZMQRequest = new ZMQRequest(t.context.ResponderEndpoint);
    const lResponse: ZMQResponse = new ZMQResponse(t.context.ResponderEndpoint, lResponderRouter);

    lRequest.Start();

    await lResponse.Start();
    const lFirstResponse: string = await lRequest.Send("hello");

    t.is(lFirstResponse, "world");
    t.is(lResponse["mCachedRequests"].size, 1);

    lResponse.Stop();
    await lResponse.Start();

    lResponder = async(aMsg: string): Promise<string> => aMsg + " response";
    const lSecondResponse: string = await lRequest.Send("hello");

    t.is(lSecondResponse, "hello response");
    t.is(lResponse["mCachedRequests"].size, 2);

    lResponse.Stop();
    lRequest.Stop();
});

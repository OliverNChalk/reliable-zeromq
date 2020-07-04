/* tslint:disable: no-string-literal */
import anyTest, { ExecutionContext } from "ava";
import type { TestInterface } from "ava";
import * as sinon from "sinon";
import Sinon from "sinon";
import { ImportMock, MockManager } from "ts-mock-imports";
import * as zmq from "zeromq";
import { Delay } from "../Src/Utils/Delay";
import { ZMQRequest } from "../Src/ZMQRequest";
import { ZMQResponse } from "../Src/ZMQResponse";

type TAsyncIteratorResult = { value: any; done: boolean };
type TTestContext =
{
    ResponderEndpoint: string;
    RouterMock: MockManager<zmq.Router>;
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

    const lMockManager: MockManager<zmq.Router> = ImportMock.mockClass<zmq.Router>(zmq, "Router");
    // @ts-ignore
    lMockManager.mock(Symbol.asyncIterator, lNewIterator);

    t.context = {
        ResponderEndpoint: "tcp://127.0.0.1:3001",
        RouterMock: lMockManager,
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

test.serial("Start, Receive, Repeat", async(t: ExecutionContext<TTestContext>): Promise<void> =>
{
    let lResponder = async(aMsg: string): Promise<string> => "world";
    const lResponderRouter = (aMsg: string): Promise<string> =>
    {
        return lResponder(aMsg);    // Necessary so we can update lResponder throughout
    };

    const lResponse: ZMQResponse = new ZMQResponse(t.context.ResponderEndpoint, lResponderRouter);
    const lSendMock: Sinon.SinonStub = t.context.RouterMock.mock("send", Promise.resolve());

    await lResponse.Start();
    t.context.SendToReceiver([
        "sender",
        "0",
        "hello",
    ]);

    await Delay(0);
    t.is(lSendMock.callCount, 1);
    t.is(lResponse["mCachedRequests"].size, 1);
    t.deepEqual(lSendMock.getCall(0).args[0], ["sender", "0", "world"]);

    lResponse.Stop();
    await lResponse.Start();

    lResponder = async(aMsg: string): Promise<string> => aMsg + " response";
    t.context.SendToReceiver([
        "sender",
        "1",
        "this should not throw",
    ]);
    await Delay(0);
    t.is(lSendMock.callCount, 2);
    t.is(lResponse["mCachedRequests"].size, 2);
    t.deepEqual(lSendMock.getCall(1).args[0], ["sender", "1", "this should not throw response"]);

    t.context.SendToReceiver([
        "sender",
        "1",
        "this should not throw",
    ]);
    await Delay(0);
    t.is(lSendMock.callCount, 3);
    t.is(lResponse["mCachedRequests"].size, 2);
    t.deepEqual(lSendMock.getCall(2).args[0], ["sender", "1", "this should not throw response"]);

    t.context.SendToReceiver([
        "sender",
        "1",
        "this should not throw",
    ]);
    await Delay(0);
    t.is(lSendMock.callCount, 4);
    t.is(lResponse["mCachedRequests"].size, 2);
    t.deepEqual(lSendMock.getCall(3).args[0], ["sender", "1", "this should not throw response"]);

    lResponse.Stop();
});

test.serial("Networked: Start, Receive, Repeat", async(t: ExecutionContext<TTestContext>): Promise<void> =>
{
    t.context.RouterMock.restore();
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

test.todo("Multiple Requests Don't Block");

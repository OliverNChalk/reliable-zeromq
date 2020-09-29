/* tslint:disable: no-string-literal */
import anyTest, { ExecutionContext } from "ava";
import type { TestInterface } from "ava";
import * as sinon from "sinon";
import Sinon from "sinon";
import { ImportMock, MockManager } from "ts-mock-imports";
import * as zmq from "zeromq";
import { REGISTRATION_SUCCESS, ZMQResponse } from "../../Src/ZMQResponse";
import { YieldToEventLoop } from "../Helpers/AsyncTools";

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

test.serial("Start, Receive, Close", async(t: ExecutionContext<TTestContext>): Promise<void> =>
{
    let lResponder = async(aMsg: string): Promise<string> => "world";
    const lResponderRouter = (aMsg: string): Promise<string> =>
    {
        return lResponder(aMsg);    // Necessary so we can update lResponder throughout
    };

    const lSendMock: Sinon.SinonStub = t.context.RouterMock.mock("send", Promise.resolve());
    const lBindMock: Sinon.SinonStub = t.context.RouterMock.mock("bind", Promise.resolve());
    const lResponse: ZMQResponse = new ZMQResponse(t.context.ResponderEndpoint, lResponderRouter);
    await YieldToEventLoop();   // Listening to asyncIterator occurs asynchronously, so we need to yield

    t.is(lResponse.Endpoint, t.context.ResponderEndpoint);
    t.is(lBindMock.callCount, 1);

    // Register new sender with id: "unique_sender_id"
    t.context.SendToReceiver([
        "sender",
        "unique_sender_id",
        "-1",
    ]);
    await YieldToEventLoop();

    let lRouterSendCalls: number = 0;
    t.is(lSendMock.callCount, ++lRouterSendCalls);
    t.deepEqual(lSendMock.getCall(lRouterSendCalls - 1).args[0], ["sender", "-1", REGISTRATION_SUCCESS]);

    t.context.SendToReceiver([
        "sender",
        "unique_sender_id",
        "0",
        "hello",
    ]);
    await YieldToEventLoop();

    t.is(lSendMock.callCount, ++lRouterSendCalls);
    t.is(lResponse["mCachedRequests"].size, 1);
    t.deepEqual(lSendMock.getCall(lRouterSendCalls - 1).args[0], ["sender", "0", "world"]);

    lResponder = async(aMsg: string): Promise<string> => aMsg + " response";
    t.context.SendToReceiver([
        "sender",
        "unique_sender_id",
        "1",
        "this should not throw",
    ]);
    await YieldToEventLoop();

    t.is(lSendMock.callCount, ++lRouterSendCalls);
    t.is(lResponse["mCachedRequests"].size, 2);
    t.deepEqual(lSendMock.getCall(lRouterSendCalls - 1).args[0], ["sender", "1", "this should not throw response"]);

    t.context.SendToReceiver([
        "sender",
        "unique_sender_id",
        "1",
        "this should not throw",
    ]);
    await YieldToEventLoop();

    t.is(lSendMock.callCount, ++lRouterSendCalls);
    t.is(lResponse["mCachedRequests"].size, 2);
    t.deepEqual(lSendMock.getCall(lRouterSendCalls - 1).args[0], ["sender", "1", "this should not throw response"]);

    t.context.SendToReceiver([
        "sender",
        "unique_sender_id",
        "1",
        "this should not throw",
    ]);
    await YieldToEventLoop();

    t.is(lSendMock.callCount, ++lRouterSendCalls);
    t.is(lResponse["mCachedRequests"].size, 2);
    t.deepEqual(lSendMock.getCall(lRouterSendCalls - 1).args[0], ["sender", "1", "this should not throw response"]);

    lResponse.Close();
});

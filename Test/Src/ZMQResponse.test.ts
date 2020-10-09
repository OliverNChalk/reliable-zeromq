/* tslint:disable: no-string-literal */
import anyTest, { ExecutionContext } from "ava";
import type { TestInterface } from "ava";
import * as sinon from "sinon";
import Sinon from "sinon";
import { ImportMock, MockManager } from "ts-mock-imports";
import * as zmq from "zeromq";
import Config from "../../Src/Config";
import { TResponseHwmWarning } from "../../Src/Errors";
import { RESPONSE_CACHE_EXPIRED, ZMQResponse } from "../../Src/ZMQResponse";
import { YieldToEventLoop } from "../Helpers/AsyncTools";

type TAsyncIteratorResult = { value: any; done: boolean };
type TTestContext =
{
    ResponderEndpoint: string;
    RouterMock: MockManager<zmq.Router>;
    SendToReceiver: (aIndex: number, aMessage: string[]) => void;
};

const test: TestInterface<TTestContext> = anyTest as TestInterface<TTestContext> ;

test.before((t: ExecutionContext<TTestContext>): void =>
{
    // Unnecessary
});

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

    const lMockManager: MockManager<zmq.Router> = ImportMock.mockClass<zmq.Router>(zmq, "Router");
    // @ts-ignore
    const lAsyncIteratorMock: sinon.SinonStub = lMockManager.mock(Symbol.asyncIterator);
    lAsyncIteratorMock.callsFake(FakeIterator);

    t.context = {
        ResponderEndpoint: "tcp://127.0.0.1:3001",
        RouterMock: lMockManager,
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

    // Send first message to ZMQResponse
    t.context.SendToReceiver(
        0,
        [
            "sender",
            "unique_sender_id",
            "0",
            "hello",
        ],
    );
    await YieldToEventLoop();

    let lRouterSendCalls: number = 0;
    t.is(lSendMock.callCount, ++lRouterSendCalls);
    t.is(lResponse["mCachedRequests"].size, 1);
    t.deepEqual(lSendMock.getCall(lRouterSendCalls - 1).args[0], ["sender", "0", "world"]);

    lResponder = async(aMsg: string): Promise<string> => aMsg + " response";
    t.context.SendToReceiver(
        1,
        [
            "sender",
            "unique_sender_id",
            "1",
            "this should not throw",
        ],
    );
    await YieldToEventLoop();

    t.is(lSendMock.callCount, ++lRouterSendCalls);
    t.is(lResponse["mCachedRequests"].size, 2);
    t.deepEqual(lSendMock.getCall(lRouterSendCalls - 1).args[0], ["sender", "1", "this should not throw response"]);

    t.context.SendToReceiver(
        2,
        [
            "sender",
            "unique_sender_id",
            "1",
            "this should not throw",
        ],
    );
    await YieldToEventLoop();

    t.is(lSendMock.callCount, ++lRouterSendCalls);
    t.is(lResponse["mCachedRequests"].size, 2);
    t.deepEqual(lSendMock.getCall(lRouterSendCalls - 1).args[0], ["sender", "1", "this should not throw response"]);

    t.context.SendToReceiver(
        3,
        [
            "sender",
            "unique_sender_id",
            "1",
            "this should not throw",
        ],
    );
    await YieldToEventLoop();

    t.is(lSendMock.callCount, ++lRouterSendCalls);
    t.is(lResponse["mCachedRequests"].size, 2);
    t.deepEqual(lSendMock.getCall(lRouterSendCalls - 1).args[0], ["sender", "1", "this should not throw response"]);

    t.context.SendToReceiver(
        4,
        [
            "sender",
            "unique_sender_id",
            "3",
            "this should not throw",
        ],
    );
    await YieldToEventLoop();

    t.is(lSendMock.callCount, ++lRouterSendCalls);
    t.is(lResponse["mCachedRequests"].size, 3);
    t.deepEqual(lSendMock.getCall(lRouterSendCalls - 1).args[0], ["sender", "3", "this should not throw response"]);

    t.context.SendToReceiver(
        5,
        [
            "sender",
            "unique_sender_id",
            "2",
            "this should not throw",
        ],
    );
    await YieldToEventLoop();

    t.is(lSendMock.callCount, ++lRouterSendCalls);
    t.is(lResponse["mCachedRequests"].size, 4);
    t.deepEqual(lSendMock.getCall(lRouterSendCalls - 1).args[0], ["sender", "2", "this should not throw response"]);

    // Test LowestUnseenNonce garbage cleaning
    t.is(lResponse["mSeenMessages"].get("unique_sender_id")!.Has(0), true);
    t.is(lResponse["mSeenMessages"].get("unique_sender_id")!.Has(1), true);
    t.is(lResponse["mSeenMessages"].get("unique_sender_id")!.Has(2), true);
    t.is(lResponse["mSeenMessages"].get("unique_sender_id")!.Has(3), true);
    t.is(lResponse["mSeenMessages"].get("unique_sender_id")!.Has(4), false);

    lResponse.Close();
});

test.serial("Errors & Warns", async(t: ExecutionContext<TTestContext>): Promise<void> =>
{
    const clock: sinon.SinonFakeTimers = sinon.useFakeTimers();

    let lResponder = (aMsg: string): Promise<string> => Promise.resolve(aMsg + " RES");
    const lResponderRouter = (aMsg: string): Promise<string> =>
    {
        return lResponder(aMsg);    // Necessary so we can update lResponder throughout
    };
    const lEndpoint: string = t.context.ResponderEndpoint;

    const lSendMock: Sinon.SinonStub = t.context.RouterMock.mock("send", Promise.resolve());
    t.context.RouterMock.mock("bind", Promise.resolve());

    const lWarnings: TResponseHwmWarning[] = [];
    const lResponse: ZMQResponse = new ZMQResponse(lEndpoint, lResponderRouter);
    const lCustomResponse: ZMQResponse = new ZMQResponse(
        lEndpoint,
        lResponderRouter,
        {
            HighWaterMarkWarning: (aWarning: TResponseHwmWarning): void =>
            {
                lWarnings.push(aWarning);
            },
        },
    );
    await YieldToEventLoop();   // Listening to asyncIterator occurs asynchronously, so we need to yield

    t.context.SendToReceiver(0, ["sender", "uid", "0", "hello"]);
    await YieldToEventLoop();

    let lCallsToSend: number = 0;
    t.deepEqual(lSendMock.getCall(lCallsToSend++).args[0], ["sender", "0", "hello RES"]);

    clock.tick(3 * Config.MaximumLatency);
    t.context.SendToReceiver(2, ["sender", "uid", "0", "hello again"]);
    await YieldToEventLoop();
    t.deepEqual(lSendMock.getCall(lCallsToSend++).args[0], ["sender", "0", "hello RES"]);

    clock.tick(500);    // 500ms is the buffer added on by ExpiryMap
    t.context.SendToReceiver(3, ["sender", "uid", "0", "hello again"]);
    await YieldToEventLoop();
    t.deepEqual(lSendMock.getCall(lCallsToSend++).args[0], ["sender", "0", RESPONSE_CACHE_EXPIRED]);

    lSendMock
        .onCall(lCallsToSend).returns(Promise.reject(
            {
                code: "EAGAIN",
            },
        ))
        .onCall(lCallsToSend + 1).returns(Promise.reject(
            {
                code: "EAGAIN",
            },
        ));

    t.context.SendToReceiver(4, ["sender", "uid", "1", "warning suppress"]);
    await YieldToEventLoop();

    t.context.SendToReceiver(1, ["custom_sender", "uid", "0", "warning handler"]);
    await YieldToEventLoop();

    // UPDATE RESPONDER FOR NEXT STAGE
    let lCallCount: number = 0;
    lResponder = (): Promise<string> =>
    {
        ++lCallCount;
        return new Promise((aResolve: (aValue: string) => void): void =>
        {
            setTimeout(() => aResolve("DELAY DONE"), 50);
        });
    };

    t.context.SendToReceiver(5, ["sender", "uid", "0", "this will be another cache error"]);
    await YieldToEventLoop();

    t.deepEqual(lSendMock.getCall(lCallsToSend++).args[0], ["sender", "1", "warning suppress RES"]);
    t.deepEqual(lSendMock.getCall(lCallsToSend++).args[0], ["custom_sender", "0", "warning handler RES"]);
    t.deepEqual(lSendMock.getCall(lCallsToSend++).args[0], ["sender", "0", RESPONSE_CACHE_EXPIRED]);

    t.is(lWarnings.length, 1);
    t.deepEqual(lWarnings[0], { Requester: "uid", Nonce: 0, Message: "warning handler RES"});

    t.is(lCallCount, 0);
    t.context.SendToReceiver(7, ["sender", "uid", "2", "START DELAY"]);
    await YieldToEventLoop();

    t.is(lCallCount, 1);
    t.context.SendToReceiver(8, ["sender", "uid", "2", "START DELAY"]);
    await YieldToEventLoop();

    t.is(lCallCount, 1);
    t.is(lSendMock.callCount, lCallsToSend);

    clock.tick(50);
    await YieldToEventLoop();

    t.is(lSendMock.callCount, lCallsToSend + 1);
    t.deepEqual(lSendMock.getCall(lCallsToSend++).args[0], ["sender", "2", "DELAY DONE"]);

    lResponse.Close();
    lCustomResponse.Close();

    t.context.SendToReceiver(9, [undefined as any, "SUPPRESS THIS"]);
    await YieldToEventLoop();
    t.context.SendToReceiver(9, [undefined as any, "SUPPRESS THIS"]);
    await YieldToEventLoop();
});

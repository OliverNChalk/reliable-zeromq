/* tslint:disable: no-string-literal */
import anyTest, { ExecutionContext } from "ava";
import type { TestInterface } from "ava";
import * as sinon from "sinon";
import Sinon from "sinon";
import { ImportMock, MockManager } from "ts-mock-imports";
import * as zmq from "zeromq";
import { ZMQResponse } from "../../Src/ZMQResponse";
import { YieldToEventLoop } from "../Helpers/AsyncTools";

type TTestContext =
{
    ResponderEndpoint: string;
    RouterMock: MockManager<zmq.Router>;
    SendToReceiver: (aMessage: string[]) => void;
};

const test: TestInterface<TTestContext> = anyTest as TestInterface<TTestContext> ;

test.before((t: ExecutionContext<TTestContext>): void =>
{
    // Unnecessary
});

test.beforeEach((t: ExecutionContext<TTestContext>): void =>
{
    let lPendingReceive: any = undefined;
    // let lPendingReject: any = undefined;
    function NewReceivePromise(): Promise<Buffer[]>
    {
        return new Promise((aResolve: (aValue: Buffer[]) => void, aReject: () => void): void =>
        {
            lPendingReceive = aResolve;
            // lPendingReject = aReject;
        });
    }

    const lMockManager: MockManager<zmq.Router> = ImportMock.mockClass<zmq.Router>(zmq, "Router");
    const lMockedReceive: sinon.SinonStub = lMockManager.mock("receive");
    lMockedReceive.callsFake(NewReceivePromise);

    t.context =
    {
        ResponderEndpoint: "tcp://127.0.0.1:3001",
        RouterMock: lMockManager,
        SendToReceiver: (aStrings: string[]): void =>
        {
              lPendingReceive(aStrings.map((aString: string) => Buffer.from(aString)));
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
    t.context.SendToReceiver([
        "sender",
        "unique_sender_id",
        "0",
        "hello",
    ]);
    await YieldToEventLoop();

    let lRouterSendCalls: number = 0;
    t.is(lSendMock.callCount, ++lRouterSendCalls);
    t.is(lResponse["mCachedRequests"].size, 1);
    t.deepEqual(
        lSendMock.getCall(lRouterSendCalls - 1).args[0],
        [Buffer.from("sender"), Buffer.from("0"), "world"], // Responses from responseHandler are strings, rest are buffers
    );

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
    t.deepEqual(
        lSendMock.getCall(lRouterSendCalls - 1).args[0],
        [Buffer.from("sender"), Buffer.from("1"), "this should not throw response"],
    );

    t.context.SendToReceiver([
        "sender",
        "unique_sender_id",
        "1",
        "this should not throw",
    ]);
    await YieldToEventLoop();

    t.is(lSendMock.callCount, ++lRouterSendCalls);
    t.is(lResponse["mCachedRequests"].size, 2);
    t.deepEqual(
        lSendMock.getCall(lRouterSendCalls - 1).args[0],
        [Buffer.from("sender"), Buffer.from("1"), "this should not throw response"],
    );

    t.context.SendToReceiver([
        "sender",
        "unique_sender_id",
        "1",
        "this should not throw",
    ]);
    await YieldToEventLoop();

    t.is(lSendMock.callCount, ++lRouterSendCalls);
    t.is(lResponse["mCachedRequests"].size, 2);
    t.deepEqual(
        lSendMock.getCall(lRouterSendCalls - 1).args[0],
        [Buffer.from("sender"), Buffer.from("1"), "this should not throw response"],
    );

    t.context.SendToReceiver([
        "sender",
        "unique_sender_id",
        "3",
        "this should not throw",
    ]);
    await YieldToEventLoop();

    t.is(lSendMock.callCount, ++lRouterSendCalls);
    t.is(lResponse["mCachedRequests"].size, 3);
    t.deepEqual(
        lSendMock.getCall(lRouterSendCalls - 1).args[0],
        [Buffer.from("sender"), Buffer.from("3"), "this should not throw response"],
    );

    t.context.SendToReceiver([
        "sender",
        "unique_sender_id",
        "2",
        "this should not throw",
    ]);
    await YieldToEventLoop();

    t.is(lSendMock.callCount, ++lRouterSendCalls);
    t.is(lResponse["mCachedRequests"].size, 4);
    t.deepEqual(
        lSendMock.getCall(lRouterSendCalls - 1).args[0],
        [Buffer.from("sender"), Buffer.from("2"), "this should not throw response"],
    );

    // Test LowestUnseenNonce garbage cleaning
    t.is(lResponse["mSeenMessages"].get("unique_sender_id")!.Has(0), true);
    t.is(lResponse["mSeenMessages"].get("unique_sender_id")!.Has(1), true);
    t.is(lResponse["mSeenMessages"].get("unique_sender_id")!.Has(2), true);
    t.is(lResponse["mSeenMessages"].get("unique_sender_id")!.Has(3), true);
    t.is(lResponse["mSeenMessages"].get("unique_sender_id")!.Has(4), false);

    lResponse.Close();
});

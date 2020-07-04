/* tslint:disable: no-string-literal */
import type { TestInterface } from "ava";
import anyTest, { ExecutionContext } from "ava";
import * as Sinon from "sinon";
import { ImportMock, MockManager } from "ts-mock-imports";
import * as zmq from "zeromq";
import { EEndpoint, HEARTBEAT_INTERVAL, PUBLISHER_CACHE_EXPIRY_MS } from "../Src/Constants";
import JSONBigInt from "../Src/Utils/JSONBigInt";
import { EMessageType, ZMQPublisher } from "../Src/ZMQPublisher";
import * as ZMQResponse from "../Src/ZMQResponse";

type TAsyncIteratorResult = { value: any; done: boolean };
type TTestContext =
{
    PublisherEndpoint: string;
    PublisherMock: MockManager<zmq.Publisher>;
    ResponderMock: MockManager<ZMQResponse.ZMQResponse>;
    SUTCallback: (aMessage: TAsyncIteratorResult) => void;
    SendToReceiver: (aMessage: string[]) => void;
    TestData: any[];
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

    const lResponderMock: MockManager<ZMQResponse.ZMQResponse>
        = ImportMock.mockClass<ZMQResponse.ZMQResponse>(ZMQResponse, "ZMQResponse");
    const lPublisherMock: MockManager<zmq.Publisher> = ImportMock.mockClass<zmq.Publisher>(zmq, "Publisher");
    // @ts-ignore
    lPublisherMock.mock(Symbol.asyncIterator, lNewIterator);

    t.context = {
        PublisherEndpoint: "tcp://127.0.0.1:3002",
        PublisherMock: lPublisherMock,
        ResponderMock: lResponderMock,
        SUTCallback: null!,
        SendToReceiver: (aMessage: string[]): void =>
        {
            t.context.SUTCallback({ value: aMessage, done: false });
        },
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
    Sinon.restore();
    ImportMock.restore();
});

test.serial("Start, Publish, Respond, Repeat", async(t: ExecutionContext<TTestContext>): Promise<void> =>
{
    const clock: Sinon.SinonFakeTimers = Sinon.useFakeTimers();
    const lZmqPublisher: MockManager<zmq.Publisher> = t.context.PublisherMock;
    const lResponseMock: MockManager<ZMQResponse.ZMQResponse> = t.context.ResponderMock;
    const lPublisher: ZMQPublisher = new ZMQPublisher(EEndpoint.STATUS_UPDATES);

    lZmqPublisher.mock("bind", Promise.resolve());
    lResponseMock.mock("Start", Promise.resolve());
    lPublisher.Start();

    const lSendMock: Sinon.SinonStub = lZmqPublisher.mock("send", Promise.resolve());
    await lPublisher.Publish("myTopicA", "myFirstMessage");

    t.is(lSendMock.callCount, 1);
    t.deepEqual(lSendMock.getCall(0).args[0], ["myTopicA", EMessageType.PUBLISH, "0", "\"myFirstMessage\""]);
    t.is(lPublisher["mMessageCaches"].size, 1);
    t.is(lPublisher["mMessageCaches"].get("myTopicA")!.size, 1);
    t.is(lPublisher["mTopicDetails"].size, 1);

    await lPublisher.Publish("myTopicA", JSONBigInt.Stringify(t.context.TestData));

    t.is(lSendMock.callCount, 2);
    t.deepEqual(
        lSendMock.getCall(1).args[0],
        ["myTopicA", EMessageType.PUBLISH, "1", JSONBigInt.Stringify(JSONBigInt.Stringify(t.context.TestData))],
    );
    t.is(lPublisher["mMessageCaches"].size, 1);
    t.is(lPublisher["mMessageCaches"].get("myTopicA")!.size, 2);
    t.is(lPublisher["mTopicDetails"].size, 1);

    const lRecoveryRequest: [string, ...number[]] =
    [
        "myTopicA",
        0,
        1,
    ];
    const lRecoveryResponse: string = await lPublisher["HandleRequest"](JSONBigInt.Stringify(lRecoveryRequest));
    const lExpectedRecoveryResponse: string[][] = [
        lSendMock.getCall(0).args[0],
        lSendMock.getCall(1).args[0],
    ];

    t.deepEqual(JSONBigInt.Parse(lRecoveryResponse), lExpectedRecoveryResponse);

    lPublisher.Stop();
    await lPublisher.Start();

    const lTestData: [string, string][] =
    [
        ["newTopicA", "myMessageA"],
        ["newTopicA", "myMessageB"],
        ["newTopicA", "myMessageC"],
        ["newTopic1", "myMessage~"],
        ["newTopic1", "myMessage~"],
    ];
    await lPublisher.Publish("newTopicA", "myMessageA");
    await lPublisher.Publish("newTopicA", "myMessageB");
    await lPublisher.Publish("newTopicA", "myMessageC");
    await lPublisher.Publish("newTopic1", "myMessage~");
    await lPublisher.Publish("newTopic1", "myMessage~");

    for (let i: number = 0; i < 5; ++i)
    {
        t.is(lSendMock.getCall(i + 2).args[0][0], lTestData[i][0]);
        t.is(lSendMock.getCall(i + 2).args[0][3], "\"" + lTestData[i][1] + "\"");
    }

    const lSecondRecoveryRequest: [string, ...number[]] =
    [
        "newTopicA",
        0,
        1,
        2,
    ];
    const lThirdRecoveryRequest: [string, ...number[]] =
    [
        "newTopic1",
        0,
        1,
    ];

    const lSecondRecoveryResponse: string
        = await lPublisher["HandleRequest"](JSONBigInt.Stringify(lSecondRecoveryRequest));
    const lThirdRecoveryResponse: string
        = await lPublisher["HandleRequest"](JSONBigInt.Stringify(lThirdRecoveryRequest));

    const lExpectedSecondResponse: string[][] =
    [
        lSendMock.getCall(2).args[0],
        lSendMock.getCall(3).args[0],
        lSendMock.getCall(4).args[0],
    ];
    const lExpectedThirdResponse: string[][] =
    [
        lSendMock.getCall(5).args[0],
        lSendMock.getCall(6).args[0],
    ];

    t.deepEqual(JSONBigInt.Parse(lSecondRecoveryResponse), lExpectedSecondResponse);
    t.deepEqual(JSONBigInt.Parse(lThirdRecoveryResponse), lExpectedThirdResponse);

    // TODO: Test Heartbeating
    // t.is(lSendMock.callCount, 7);
    // t.is(lPublisher["mTopicDetails"].size, 3);
    // clock.tick(HEARTBEAT_INTERVAL);
    // // const lHeartbeat
    //
    // t.is(lSendMock.callCount, 13);  // KNOWN ISSUE: Start and Stop without delay triggers two timeouts
    // // t.deepEqual([])
});

// test.serial("Networked: Start, Receive, Repeat", async(t: ExecutionContext<TTestContext>): Promise<void> =>
// {
//     t.context.PublisherMock.restore();
//     let lResponder = async(aMsg: string): Promise<string> => "world";
//     const lResponderRouter = (aMsg: string): Promise<string> =>
//     {
//         return lResponder(aMsg);    // Necessary so we can update lResponder throughout
//     };
//
//     const lRequest: ZMQRequest = new ZMQRequest(t.context.PublisherEndpoint);
//     const lResponse: ZMQResponse = new ZMQResponse(t.context.PublisherEndpoint, lResponderRouter);
//
//     lRequest.Start();
//
//     await lResponse.Start();
//     const lFirstResponse: string = await lRequest.Send("hello");
//
//     t.is(lFirstResponse, "world");
//     t.is(lResponse["mCachedRequests"].size, 1);
//
//     lResponse.Stop();
//     await lResponse.Start();
//
//     lResponder = async(aMsg: string): Promise<string> => aMsg + " response";
//     const lSecondResponse: string = await lRequest.Send("hello");
//
//     t.is(lSecondResponse, "hello response");
//     t.is(lResponse["mCachedRequests"].size, 2);
//
//     lResponse.Stop();
//     lRequest.Stop();
// });

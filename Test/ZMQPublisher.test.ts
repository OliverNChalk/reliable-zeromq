/* tslint:disable: no-string-literal */
import type { TestInterface } from "ava";
import anyTest, { ExecutionContext } from "ava";
import * as Sinon from "sinon";
import { ImportMock, MockManager } from "ts-mock-imports";
import * as zmq from "zeromq";
import Config from "../Src/Config";
import { TCacheError } from "../Src/Errors";
import JSONBigInt from "../Src/Utils/JSONBigInt";
import { EMessageType, EPublishMessage, PUBLISHER_CACHE_EXPIRED, ZMQPublisher } from "../Src/ZMQPublisher";
import * as ZMQResponse from "../Src/ZMQResponse";
import { TSubscriptionEndpoints } from "../Src/ZMQSubscriber/ZMQSubscriber";
import { YieldToEventLoop } from "./Helpers/AsyncTools";
import { DUMMY_ENDPOINTS } from "./Helpers/DummyEndpoints.data";

type TTestContext =
{
    PublisherMock: MockManager<zmq.Publisher>;
    ResponderMock: MockManager<ZMQResponse.ZMQResponse>;
    TestData: any[];
    Endpoints: TSubscriptionEndpoints;
};

const test: TestInterface<TTestContext> = anyTest as TestInterface<TTestContext> ;

test.before((t: ExecutionContext<TTestContext>): void =>
{
    // Unnecessary
});

test.beforeEach((t: ExecutionContext<TTestContext>): void =>
{
    const lResponderMock: MockManager<ZMQResponse.ZMQResponse>
        = ImportMock.mockClass<ZMQResponse.ZMQResponse>(ZMQResponse, "ZMQResponse");
    const lPublisherMock: MockManager<zmq.Publisher> = ImportMock.mockClass<zmq.Publisher>(zmq, "Publisher");

    t.context = {
        PublisherMock: lPublisherMock,
        ResponderMock: lResponderMock,
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
        Endpoints: {
            PublisherAddress: "ipc:///tmp/zeromq/status_updates/publisher.ipc",
            RequestAddress: "ipc:///tmp/zeromq/status_updates/request.ipc",
        },

    };
});

test.afterEach((t: ExecutionContext<TTestContext>): void =>
{
    Sinon.restore();
    ImportMock.restore();
});

test.serial("Start, Publish, Respond, Close", async(t: ExecutionContext<TTestContext>): Promise<void> =>
{
    const clock: Sinon.SinonFakeTimers = Sinon.useFakeTimers();
    const lZmqPublisher: MockManager<zmq.Publisher> = t.context.PublisherMock;
    const lPublisher: ZMQPublisher = new ZMQPublisher(
        t.context.Endpoints,
        {
            CacheError: (): void => {},
        },
    );

    lZmqPublisher.mock("bind", Promise.resolve());
    await lPublisher.Open();

    t.is(lPublisher.Endpoint, DUMMY_ENDPOINTS.STATUS_UPDATES.PublisherAddress);

    const lSendMock: Sinon.SinonStub = lZmqPublisher.mock("send", Promise.resolve());
    await lPublisher.Publish("myTopicA", "myFirstMessage");

    t.is(lSendMock.callCount, 1);
    t.deepEqual(lSendMock.getCall(0).args[0], ["myTopicA", EMessageType.PUBLISH, "1", "myFirstMessage"]);
    t.is(lPublisher["mMessageCaches"].size, 1);
    t.is(lPublisher["mMessageCaches"].get("myTopicA")!.size, 1);
    t.is(lPublisher["mTopicDetails"].size, 1);

    await lPublisher.Publish("myTopicA", JSONBigInt.Stringify(t.context.TestData));

    t.is(lSendMock.callCount, 2);
    t.deepEqual(
        lSendMock.getCall(1).args[0],
        ["myTopicA", EMessageType.PUBLISH, "2", JSONBigInt.Stringify(t.context.TestData)],
    );
    t.is(lPublisher["mMessageCaches"].size, 1);
    t.is(lPublisher["mMessageCaches"].get("myTopicA")!.size, 2);
    t.is(lPublisher["mTopicDetails"].size, 1);

    const lRecoveryRequest: [string, ...number[]] =
    [
        "myTopicA",
        1,
        2,
    ];
    const lRecoveryResponse: string = await lPublisher["HandleRequest"](JSONBigInt.Stringify(lRecoveryRequest));
    const lExpectedRecoveryResponse: string[][] = [
        lSendMock.getCall(0).args[0],
        lSendMock.getCall(1).args[0],
    ];

    t.deepEqual(JSONBigInt.Parse(lRecoveryResponse), lExpectedRecoveryResponse);

    const lInvalidRecoveryRequest: [number, number] =
    [
        0,  // Missing TopicId string
        1,
    ];
    const lInvalidRecoveryResponse: string
        = await lPublisher["HandleRequest"](JSONBigInt.Stringify(lInvalidRecoveryRequest));

    t.deepEqual(JSONBigInt.Parse(lInvalidRecoveryResponse), []);

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
        t.is(lSendMock.getCall(i + 2).args[0][EPublishMessage.Topic], lTestData[i][0]);
        t.is(lSendMock.getCall(i + 2).args[0][EPublishMessage.Message], lTestData[i][1]);
    }

    const lSecondRecoveryRequest: [string, ...number[]] =
    [
        "newTopicA",
        1,
        2,
        3,
    ];
    const lThirdRecoveryRequest: [string, ...number[]] =
    [
        "newTopic1",
        1,
        2,
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

    t.is(lSendMock.callCount, 7);
    t.is(lPublisher["mTopicDetails"].size, 3);
    clock.tick(Config.HeartBeatInterval);

    await YieldToEventLoop();

    const lHeartbeats: string[][] =
    [
        lSendMock.getCall(7).args[0],
        lSendMock.getCall(8).args[0],
        lSendMock.getCall(9).args[0],
    ];
    const lExpectedHeartbeats: string[][] =
    [
        ["myTopicA", EMessageType.HEARTBEAT, "2", ""],
        ["newTopicA", EMessageType.HEARTBEAT, "3", ""],
        ["newTopic1", EMessageType.HEARTBEAT, "2", ""],
    ];

    t.deepEqual(lHeartbeats, lExpectedHeartbeats);
    t.is(lSendMock.callCount, 10);

    clock.tick(Config.HeartBeatInterval);

    await YieldToEventLoop();

    t.is(lSendMock.callCount, 13);

    lPublisher.Close();
});

test.serial("Emits Errors", async(t: ExecutionContext<TTestContext>) =>
{
    const clock: Sinon.SinonFakeTimers = Sinon.useFakeTimers();
    const lZmqPublisher: MockManager<zmq.Publisher> = t.context.PublisherMock;

    const lCacheErrors: TCacheError[] = [];

    // Set Config for Test:
    Config.MaximumLatency = 1000;
    Config.HeartBeatInterval = 500;

    const lPublisher: ZMQPublisher = new ZMQPublisher(
        t.context.Endpoints,
        {
            CacheError: (aError: TCacheError): void => { lCacheErrors.push(aError); },
        },
    );

    lZmqPublisher.mock("bind", Promise.resolve());
    // lResponseMock.mock("Open" as any, Promise.resolve());
    await lPublisher.Open();

    const lSendMock: Sinon.SinonStub = lZmqPublisher.mock("send", Promise.resolve());
    await lPublisher.Publish("myTopicA", "myFirstMessage");

    t.is(lSendMock.callCount, 1);
    t.deepEqual(lSendMock.getCall(0).args[0], ["myTopicA", EMessageType.PUBLISH, "1", "myFirstMessage"]);

    const lFirstRecoveryRequest: [string, ...number[]] =
    [
        "myTopicA",
        1,
        2,
    ];
    const lFirstRecoveryResponse: string[][] = JSONBigInt.Parse(
        await lPublisher["HandleRequest"](JSONBigInt.Stringify(lFirstRecoveryRequest)),
    );
    const lFirstExpectedResponse: string[][] = [
        lSendMock.getCall(0).args[0],
        [PUBLISHER_CACHE_EXPIRED],
    ];

    t.deepEqual(lFirstRecoveryResponse, lFirstExpectedResponse);
    t.deepEqual(
        lCacheErrors[0],
        {
            Endpoint: t.context.Endpoints,
            Topic: "myTopicA",
            MessageId: 2,
        },
    );

    await lPublisher.Publish("myTopicA", "mySecondMessage");    // Message 1 & 2 published on timestamp: 0
    clock.tick(501);    // const EXPIRY_BUFFER: number = 500;

    await lPublisher.Publish("myTopicA", "myThirdMessage");     // Message 3 & 4 published on timestamp: 1
    await lPublisher.Publish("myTopicA", "myFourthMessage");

    // Expire messages 1 & 2
    clock.tick(Config.MaximumLatency * 3);
    await YieldToEventLoop();

    const lSecondRecoveryRequest: [string, ...number[]] =
    [
        "myTopicA",
        1,
        2,
        3,
        4,
    ];
    const lSecondRecoveryResponse: string[][] = JSONBigInt.Parse(
        await lPublisher["HandleRequest"](JSONBigInt.Stringify(lSecondRecoveryRequest)),
    );
    const lSecondExpectedResponse: string[][] = [
        [PUBLISHER_CACHE_EXPIRED],      // 1
        [PUBLISHER_CACHE_EXPIRED],      // 2
        lSendMock.getCall(3).args[0],   // 3
        lSendMock.getCall(4).args[0],   // 4
    ];

    t.deepEqual(lSecondRecoveryResponse, lSecondExpectedResponse);
    t.deepEqual(
        lCacheErrors[1],
        {
            Endpoint: t.context.Endpoints,
            Topic: "myTopicA",
            MessageId: 1,
        },
    );
    t.deepEqual(
        lCacheErrors[2],
        {
            Endpoint: t.context.Endpoints,
            Topic: "myTopicA",
            MessageId: 2,
        },
    );

    lPublisher.Close();

    // Reset Config
    Config.SetGlobalConfig(5000);
});

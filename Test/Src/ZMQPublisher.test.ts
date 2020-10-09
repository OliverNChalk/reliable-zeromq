/* tslint:disable: no-string-literal */
import type { TestInterface } from "ava";
import anyTest, { ExecutionContext } from "ava";
import * as Sinon from "sinon";
import { ImportMock, MockManager } from "ts-mock-imports";
import * as zmq from "zeromq";
import Config from "../../Src/Config";
import { TPublisherHwmWarning } from "../../Src/Errors";
import JSONBigInt from "../../Src/Utils/JSONBigInt";
import { EMessageType, EPublishMessage, PUBLISHER_CACHE_EXPIRED, ZMQPublisher } from "../../Src/ZMQPublisher";
import * as ZMQResponse from "../../Src/ZMQResponse";
import { TSubscriptionEndpoints } from "../../Src/ZMQSubscriber/ZMQSubscriber";
import { YieldToEventLoop } from "../Helpers/AsyncTools";
import { DUMMY_ENDPOINTS } from "../Helpers/DummyEndpoints.data";

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
        Endpoints: DUMMY_ENDPOINTS.STATUS_UPDATES,
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
    const lPublisher: ZMQPublisher = new ZMQPublisher(t.context.Endpoints);

    lZmqPublisher.mock("bind", Promise.resolve());
    await lPublisher.Open();

    t.is(lPublisher.Endpoint, DUMMY_ENDPOINTS.STATUS_UPDATES.PublisherAddress);

    const lSendMock: Sinon.SinonStub = lZmqPublisher.mock("send", Promise.resolve());
    lPublisher.Publish("myTopicA", "myFirstMessage");

    t.is(lSendMock.callCount, 1);
    t.deepEqual(lSendMock.getCall(0).args[0], ["myTopicA", EMessageType.PUBLISH, "0", "myFirstMessage"]);
    t.is(lPublisher["mMessageCaches"].size, 1);
    t.is(lPublisher["mMessageCaches"].get("myTopicA")!.size, 1);
    t.is(lPublisher["mTopicDetails"].size, 1);

    lPublisher.Publish("myTopicA", JSONBigInt.Stringify(t.context.TestData));
    await YieldToEventLoop();

    t.is(lSendMock.callCount, 2);
    t.deepEqual(
        lSendMock.getCall(1).args[0],
        ["myTopicA", EMessageType.PUBLISH, "1", JSONBigInt.Stringify(t.context.TestData)],
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

    const lInvalidRecoveryRequest: [number, number] =
    [
        -1, // Non-existant nonce
        0,
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

    lPublisher.Publish("newTopicA", "myMessageA");
    lPublisher.Publish("newTopicA", "myMessageB");
    lPublisher.Publish("newTopicA", "myMessageC");
    lPublisher.Publish("newTopic1", "myMessage~");
    lPublisher.Publish("newTopic1", "myMessage~");
    await YieldToEventLoop();

    for (let i: number = 0; i < 5; ++i)
    {
        t.is(lSendMock.getCall(i + 2).args[0][EPublishMessage.Topic], lTestData[i][0]);
        t.is(lSendMock.getCall(i + 2).args[0][EPublishMessage.Message], lTestData[i][1]);
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
        ["myTopicA", EMessageType.HEARTBEAT, "1", ""],
        ["newTopicA", EMessageType.HEARTBEAT, "2", ""],
        ["newTopic1", EMessageType.HEARTBEAT, "1", ""],
    ];

    t.deepEqual(lHeartbeats, lExpectedHeartbeats);
    t.is(lSendMock.callCount, 10);

    clock.tick(Config.HeartBeatInterval);

    await YieldToEventLoop();

    t.is(lSendMock.callCount, 13);

    lPublisher.Close();
});

test.serial("Errors & Warns", async(t: ExecutionContext<TTestContext>) =>
{
    const clock: Sinon.SinonFakeTimers = Sinon.useFakeTimers();
    const lZmqPublisher: MockManager<zmq.Publisher> = t.context.PublisherMock;

    // Set Config for Test:
    Config.MaximumLatency = 1000;
    Config.HeartBeatInterval = 500;

    const lSendMock: Sinon.SinonStub = lZmqPublisher.mock("send", Promise.resolve());
    lZmqPublisher.mock("bind", Promise.resolve());

    const lWarnings: TPublisherHwmWarning[] = [];
    const lPublisher: ZMQPublisher = new ZMQPublisher(t.context.Endpoints);
    const lCustomPublisher: ZMQPublisher = new ZMQPublisher(
        t.context.Endpoints,
        {
            HighWaterMarkWarning: (aWarning: TPublisherHwmWarning): void =>
            {
                lWarnings.push(aWarning);
            },
        },
    );

    await lCustomPublisher.Open();
    await lPublisher.Open();
    lPublisher.Publish("myTopicA", "myFirstMessage");

    t.is(lSendMock.callCount, 1);
    t.deepEqual(lSendMock.getCall(0).args[0], ["myTopicA", EMessageType.PUBLISH, "0", "myFirstMessage"]);

    const lFirstRecoveryRequest: [string, ...number[]] =
    [
        "myTopicA",
        0,
        1,
    ];
    const lFirstRecoveryResponse: string[][] = JSONBigInt.Parse(
        await lPublisher["HandleRequest"](JSONBigInt.Stringify(lFirstRecoveryRequest)),
    );
    const lFirstExpectedResponse: string[][] = [
        lSendMock.getCall(0).args[0],
        [PUBLISHER_CACHE_EXPIRED],
    ];

    t.deepEqual(lFirstRecoveryResponse, lFirstExpectedResponse);

    lPublisher.Publish("myTopicA", "mySecondMessage");    // Message 1 & 2 published on timestamp: 0
    clock.tick(501);    // const EXPIRY_BUFFER: number = 500;

    lPublisher.Publish("myTopicA", "myThirdMessage");     // Message 3 & 4 published on timestamp: 1
    lPublisher.Publish("myTopicA", "myFourthMessage");

    // Expire messages 1 & 2
    clock.tick(Config.MaximumLatency * 3);
    await YieldToEventLoop();

    const lSecondRecoveryRequest: [string, ...number[]] =
    [
        "myTopicA",
        0,
        1,
        2,
        3,
    ];
    const lSecondRecoveryResponse: string[][] = JSONBigInt.Parse(
        await lPublisher["HandleRequest"](JSONBigInt.Stringify(lSecondRecoveryRequest)),
    );
    const lSecondExpectedResponse: string[][] = [
        [PUBLISHER_CACHE_EXPIRED],      // 0
        [PUBLISHER_CACHE_EXPIRED],      // 1
        lSendMock.getCall(3).args[0],   // 2
        lSendMock.getCall(4).args[0],   // 3
    ];

    t.deepEqual(lSecondRecoveryResponse, lSecondExpectedResponse);

    lSendMock.returns(Promise.reject(
        {
            code: "EAGAIN",
        },
    ));

    // Test HWMWarning
    clock.tick(100);

    t.is(lWarnings.length, 0);
    t.is(lSendMock.callCount, 10);

    lPublisher.Publish("myTopicA", "myFifthMessage");
    await YieldToEventLoop();

    t.is(lWarnings.length, 0);
    t.is(lSendMock.callCount, 11);

    lCustomPublisher.Publish("myTopicB", "myFirstMessage");
    await YieldToEventLoop();

    t.is(lWarnings.length, 1);
    t.is(lSendMock.callCount, 12);
    t.deepEqual(lWarnings[0], { Topic: "myTopicB", Nonce: 0, Message: "myFirstMessage" });

    clock.tick(Config.HeartBeatInterval - 101); // Trigger old timeout
    clock.tick(Config.HeartBeatInterval);       // Trigger new timeout
    await YieldToEventLoop();

    t.is(lWarnings.length, 2);
    t.is(lSendMock.callCount, 14);
    t.deepEqual(lWarnings[1], { Topic: "myTopicB", Nonce: 0, Message: "" });

    lSendMock.returns(Promise.resolve());
    clock.tick(Config.HeartBeatInterval);
    await YieldToEventLoop();

    const lActual: string[][] = [lSendMock.getCall(12).args[0], lSendMock.getCall(13).args[0]].sort();
    const lExpected: string[][] = [["myTopicA", "HEARTBEAT", "4", ""], ["myTopicB", "HEARTBEAT", "0", ""]];

    t.deepEqual(lActual, lExpected);

    lPublisher.Close();
    await YieldToEventLoop();

    // Reset Config
    Config.SetGlobalConfig();
});

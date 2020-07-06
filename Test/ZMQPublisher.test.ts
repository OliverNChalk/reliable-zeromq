/* tslint:disable: no-string-literal */
import type { TestInterface } from "ava";
import anyTest, { ExecutionContext } from "ava";
import * as Sinon from "sinon";
import { ImportMock, MockManager } from "ts-mock-imports";
import * as zmq from "zeromq";
import { EEndpoint, HEARTBEAT_INTERVAL } from "../Src/Constants";
import JSONBigInt from "../Src/Utils/JSONBigInt";
import { EMessageType, ZMQPublisher } from "../Src/ZMQPublisher";
import * as ZMQResponse from "../Src/ZMQResponse";

type TTestContext =
{
    PublisherMock: MockManager<zmq.Publisher>;
    ResponderMock: MockManager<ZMQResponse.ZMQResponse>;
    TestData: any[];
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
        t.is(lSendMock.getCall(i + 2).args[0][3], lTestData[i][1]);
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
    clock.tick(HEARTBEAT_INTERVAL);

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

    clock.tick(HEARTBEAT_INTERVAL);

    t.is(lSendMock.callCount, 13);
});

test("Start, Stop, Start, Publish", async(t: ExecutionContext<TTestContext>): Promise<void> =>
{
    const lZmqPublisher: MockManager<zmq.Publisher> = t.context.PublisherMock;
    const lResponseMock: MockManager<ZMQResponse.ZMQResponse> = t.context.ResponderMock;
    const lPublisher: ZMQPublisher = new ZMQPublisher(EEndpoint.STATUS_UPDATES);

    lPublisher.Start();
    lPublisher.Stop();

    lZmqPublisher.mock("bind", Promise.resolve());
    lResponseMock.mock("Start", Promise.resolve());
    lPublisher.Start();

    const lSendMock: Sinon.SinonStub = lZmqPublisher.mock("send", Promise.resolve());
    await lPublisher.Publish("myTopicA", "myFirstMessage");

    t.is(lSendMock.callCount, 1);
    t.deepEqual(lSendMock.getCall(0).args[0], ["myTopicA", EMessageType.PUBLISH, "1", "myFirstMessage"]);
    t.is(lPublisher["mMessageCaches"].size, 1);
    t.is(lPublisher["mMessageCaches"].get("myTopicA")!.size, 1);
    t.is(lPublisher["mTopicDetails"].size, 1);

    lPublisher.Stop();
});

test.todo("Test error cases after ErrorEmitter added");

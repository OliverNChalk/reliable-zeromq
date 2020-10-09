/* tslint:disable: no-string-literal */
import type { TestInterface } from "ava";
import anyTest, { ExecutionContext } from "ava";
import sinon from "sinon";
import { ImportMock, MockManager } from "ts-mock-imports";
import * as zmq from "zeromq";
import { TDroppedMessageWarning, TPublisherCacheError } from "../../../Src/Errors";
import { Delay } from "../../../Src/Utils/Delay";
import JSONBigInt from "../../../Src/Utils/JSONBigInt";
import { EMessageType, PUBLISHER_CACHE_EXPIRED, TRecoveryResponse } from "../../../Src/ZMQPublisher";
import * as ZMQRequest from "../../../Src/ZMQRequest";
import { ERequestResponse, TRequestTimeOut, TSuccessfulRequest } from "../../../Src/ZMQRequest";
import { TSubscriptionEndpoints, ZMQSubscriber } from "../../../Src/ZMQSubscriber/ZMQSubscriber";
import { YieldToEventLoop } from "../../Helpers/AsyncTools";
import { DUMMY_ENDPOINTS } from "../../Helpers/DummyEndpoints.data";

type TAsyncIteratorResult = { value: any; done: boolean };
type TTestContext =
{
    RequestMock: MockManager<ZMQRequest.ZMQRequest>;
    TestData: any[];
    StatusEndpoint: TSubscriptionEndpoints;
    WeatherEndpoint: TSubscriptionEndpoints;
    SendToReceiver: (aIndex: number, aMessage: string[]) => void;
};

const test: TestInterface<TTestContext> = anyTest as TestInterface<TTestContext>;

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

    const lMockManager: MockManager<zmq.Subscriber> = ImportMock.mockClass<zmq.Subscriber>(zmq, "Subscriber");
    // @ts-ignore
    const lAsyncIteratorMock: sinon.SinonStub = lMockManager.mock(Symbol.asyncIterator);
    lAsyncIteratorMock.callsFake(FakeIterator);

    const lRequestMock: MockManager<ZMQRequest.ZMQRequest> = ImportMock.mockClass<ZMQRequest.ZMQRequest>(ZMQRequest, "ZMQRequest");

    t.context =
    {
        RequestMock: lRequestMock,
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
        StatusEndpoint: {
            PublisherAddress: DUMMY_ENDPOINTS.STATUS_UPDATES.PublisherAddress,
            RequestAddress: DUMMY_ENDPOINTS.STATUS_UPDATES.RequestAddress,
        },
        WeatherEndpoint: {
            PublisherAddress: DUMMY_ENDPOINTS.WEATHER_UPDATES.PublisherAddress,
            RequestAddress: DUMMY_ENDPOINTS.WEATHER_UPDATES.RequestAddress,
        },
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

test.serial("Start, Subscribe, Recover, Close", async(t: ExecutionContext<TTestContext>): Promise<void> =>
{
    type TTopic = {
        topic: string;
        subId: number;
        test: {
            publish: (aZmqMessage: string[]) => void;
            data: string;
            result: string;
        }[];
    };
    type TTestDataResult = { [index: string]: TTopic[] };

    const lTestDataResult: TTestDataResult =
    {
        [DUMMY_ENDPOINTS.STATUS_UPDATES.PublisherAddress]: [],
        [DUMMY_ENDPOINTS.WEATHER_UPDATES.PublisherAddress]: [],
    };

    const lStatusTopics: TTopic[] = lTestDataResult[DUMMY_ENDPOINTS.STATUS_UPDATES.PublisherAddress];
    const lWeatherTopics: TTopic[] = lTestDataResult[DUMMY_ENDPOINTS.WEATHER_UPDATES.PublisherAddress];

    lStatusTopics[0]
        = { topic: "TopicA", subId: 0, test: [{ data: "myTopicAMessage", result: undefined!, publish: undefined! }] };
    lStatusTopics[1]
        = { topic: "TopicB", subId: 0, test: [
            { data: "myTopicBMessage1", result: undefined!, publish: undefined! },
            { data: "myTopicBMessage2", result: undefined!, publish: undefined! },
            { data: "myTopicBMessage3", result: undefined!, publish: undefined! },
            { data: "myTopicBMessage4", result: undefined!, publish: undefined! },
            { data: "myTopicBMessage5", result: undefined!, publish: undefined! },
        ] };
    lStatusTopics[2]
        = { topic: "TopicC", subId: 0, test: [{ data: "myTopicCMessage", result: undefined!, publish: undefined! }] };
    lWeatherTopics[0]
        = { topic: "Sydney", subId: 0, test: [{ data: "Sunny", result: undefined!, publish: undefined! }] };
    lWeatherTopics[1]
        = { topic: "Newcastle", subId: 0, test: [{ data: "Cloudy", result: undefined!, publish: undefined! }] };

    let lSoloPublisher: (aZmqMsg: string[]) => void = undefined!;

    let lIteration: number = 0;
    const lNewIterator = (aValue: TAsyncIteratorResult): { next(): Promise<TAsyncIteratorResult> } =>
    {
        const lIterationOld: number = lIteration++;
        let lNextCount: number = 0;
        return {
            async next(): Promise<TAsyncIteratorResult>
            {
                return new Promise((resolve: (aValue: TAsyncIteratorResult) => void): void =>
                {
                    lInsertCallback(resolve, lIterationOld, lNextCount++);
                });
            },
        };
    };

    const lInsertCallback = (aFunc: (aValue: TAsyncIteratorResult) => void, aIteration: number, aCount: number): void =>
    {
        const lFunc = (aMsg: string[]): void =>
        {
            return aFunc({ value: aMsg, done: false });
        };

        function InsertByCount(aEndpoint: string, aCount: number): void
        {
            const lTopics: TTopic[] = lTestDataResult[aEndpoint];

            let x: number = 0;
            let y: number = 0;
            let incrementX: boolean = false;

            for (let i: number = 0; i < aCount; ++i)
            {
                const lNextPosition: any = lTopics[x].test[y + 1];

                if (lNextPosition)
                {
                    ++y;
                }
                else
                {
                    if (incrementX)
                    {
                        ++x;
                        y = 0;
                        incrementX = false;
                    }
                    else
                    {
                        incrementX = true;  // Let's us duplicate the last message and close the iterator
                    }
                }
            }

            if (lTopics[x])
            {
                if (!incrementX)
                {
                    lTopics[x].test[y].publish = function firstTimePublish(aMsg: string[]): void
                    {
                        return aFunc({ value: aMsg, done: false });
                    };
                }
                else
                {
                    lTopics[x].test[y].publish = function duplicatePublish(aMsg: string[]): void
                    {
                        return aFunc({ value: aMsg, done: false });
                    };
                }
            }
        }

        switch (aIteration)
        {
            case 0:
                lSoloPublisher = lFunc;
                break;
            case 1:
                InsertByCount(DUMMY_ENDPOINTS.STATUS_UPDATES.PublisherAddress, aCount);
                break;
            case 2:
                InsertByCount(DUMMY_ENDPOINTS.WEATHER_UPDATES.PublisherAddress, aCount);
                break;
            default:
                throw new Error("Unexpected call to create asyncIterator");
        }
    };

    const lZmqSubscriberMock: MockManager<zmq.Subscriber> = ImportMock.mockClass<zmq.Subscriber>(zmq, "Subscriber");
    // @ts-ignore
    const lIteratorStub: Sinon.SinonStub = lZmqSubscriberMock.mock(Symbol.asyncIterator, lNewIterator);
    lIteratorStub.callsFake(lNewIterator);

    // END SETUP

    const lSubscriber: ZMQSubscriber = new ZMQSubscriber();

    let lCalled: boolean = false;
    lSubscriber.Subscribe(
        {
            PublisherAddress: DUMMY_ENDPOINTS.STATUS_UPDATES.PublisherAddress,
            RequestAddress: DUMMY_ENDPOINTS.STATUS_UPDATES.RequestAddress,
        },
        "myFirstTopic",
        (aMsg: string): void =>
        {
            t.is(aMsg, JSONBigInt.Stringify(t.context.TestData));
            lCalled = true;
        },
    );

    lSoloPublisher(
        [
            "myFirstTopic",
            EMessageType.PUBLISH,
            "0",
            JSONBigInt.Stringify(t.context.TestData),
        ],
    );
    await YieldToEventLoop();

    t.true(lCalled);

    t.is(lSubscriber["mEndpoints"].size, 1);
    lSubscriber.Close();
    t.is(lSubscriber["mEndpoints"].size, 0);

    const lSubscribe = (aEndpoint: TSubscriptionEndpoints, aIndex: number): void =>
    {
        const lTopic: TTopic = lTestDataResult[aEndpoint.PublisherAddress][aIndex];
        let lCallNumber: number = 0;

        lTopic.subId = lSubscriber.Subscribe(aEndpoint, lTopic.topic, (aMsg: string): void =>
        {
            t.assert(lCallNumber < lTestDataResult[aEndpoint.PublisherAddress][aIndex].test.length);
            lTestDataResult[aEndpoint.PublisherAddress][aIndex].test[lCallNumber++].result = aMsg;
        });
    };

    lSubscribe({
        PublisherAddress: DUMMY_ENDPOINTS.STATUS_UPDATES.PublisherAddress,
        RequestAddress: DUMMY_ENDPOINTS.STATUS_UPDATES.RequestAddress,
    }, 0);

    lSubscribe(t.context.StatusEndpoint, 1);

    lSubscribe(t.context.StatusEndpoint, 2);

    lSubscribe(t.context.WeatherEndpoint, 0);

    lSubscribe(t.context.WeatherEndpoint, 1);

    for (const aEndpoint in lTestDataResult)
    {
        const lTopics: TTopic[] = lTestDataResult[aEndpoint];

        for (let aIndex: number = 0; aIndex < lTopics.length; ++aIndex)
        {
            const lTopic: TTopic = lTopics[aIndex];
            for (let i: number = 0; i < lTopic.test.length; ++i)
            {
                await YieldToEventLoop();
                lTopic.test[i].publish([
                    lTopic.topic,
                    EMessageType.PUBLISH,
                    (i).toString(),
                    lTopic.test[i].data,
                ]);

                if (i === lTopic.test.length - 1)
                {
                    // Duplicate final message to test drop handling
                    await YieldToEventLoop();
                    lTopic.test[i].publish([
                        lTopic.topic,
                        EMessageType.PUBLISH,
                        (i).toString(),
                        "DUPLICATE MESSAGE: IGNORE DATA",
                    ]);
                }
            }
        }
    }
    await YieldToEventLoop();

    for (const aEndpoint in lTestDataResult)
    {
        const lTopics: TTopic[] = lTestDataResult[aEndpoint];

        for (let aIndex: number = 0; aIndex < lTopics.length; ++aIndex)
        {
            const lTopic: TTopic = lTopics[aIndex];
            for (let i: number = 0; i < lTopic.test.length; ++i)
            {
                t.is(lTopic.test[i].data, lTopic.test[i].result);
            }
        }
    }

    for (const aEndpoint in lTestDataResult)
    {
        const lTopics: TTopic[] = lTestDataResult[aEndpoint];

        for (let aIndex: number = 0; aIndex < lTopics.length; ++aIndex)
        {
            const lTopic: TTopic = lTopics[aIndex];

            lSubscriber.Unsubscribe(lTopic.subId);
        }

        t.is(lSubscriber["mEndpoints"].get(aEndpoint), undefined);
    }
});

test.serial("Message Recovery & Heartbeats", async(t: ExecutionContext<TTestContext>): Promise<void> =>
{
    const clock: sinon.SinonFakeTimers = sinon.useFakeTimers();

    const lCustomCacheErrors: TPublisherCacheError[] = [];
    const lCustomDroppedMessages: TDroppedMessageWarning[] = [];

    const lCustomSubIds: number[] = [];
    const lCustomResults: string[] = [];
    const lDefaultSubIds: number[] = [];
    const lDefaultResults: string[] = [];

    const lCustomSubscriber: ZMQSubscriber = new ZMQSubscriber(
        {
            CacheError: (aError: TPublisherCacheError): void => { lCustomCacheErrors.push(aError); },
            DroppedMessageWarn: (aWarning: TDroppedMessageWarning): void => { lCustomDroppedMessages.push(aWarning); },
        },
    );
    const lDefaultSubscriber: ZMQSubscriber = new ZMQSubscriber();

    lCustomSubIds[0] = lCustomSubscriber.Subscribe(
        {
            PublisherAddress: DUMMY_ENDPOINTS.STATUS_UPDATES.PublisherAddress,
            RequestAddress: DUMMY_ENDPOINTS.STATUS_UPDATES.RequestAddress,
        },
        "TopicToTest",
        (aMsg: string): void => { lCustomResults.push(aMsg); },
    );
    lCustomSubIds[1] = lCustomSubscriber.Subscribe(
        t.context.WeatherEndpoint,
        "Sydney",
        (aMsg: string): void => { lCustomResults.push(aMsg); },
    );
    lDefaultSubIds[0] = lDefaultSubscriber.Subscribe(
        {
            PublisherAddress: DUMMY_ENDPOINTS.STATUS_UPDATES.PublisherAddress,
            RequestAddress: DUMMY_ENDPOINTS.STATUS_UPDATES.RequestAddress,
        },
        "TopicToTest",
        (aMsg: string): void => { lDefaultResults.push(aMsg); },
    );

    const lRequestMock: MockManager<ZMQRequest.ZMQRequest> = t.context.RequestMock;
    const lSendMock: sinon.SinonStub = lRequestMock.mock("Send");

    const lStatusResponse: TRecoveryResponse =
    [
        ["TopicToTest", EMessageType.PUBLISH, 0, "Hello1"],
        ["TopicToTest", EMessageType.PUBLISH, 1, "Hello2"],
        ["TopicToTest", EMessageType.PUBLISH, 2, "Hello3"],
    ];
    const lWeatherResponse: TRecoveryResponse =
    [
        ["Sydney", EMessageType.PUBLISH, 0, "Rainy"],
        ["Sydney", EMessageType.PUBLISH, 1, "Misty"],
        ["Sydney", EMessageType.PUBLISH, 2, "Cloudy"],
        ["Sydney", EMessageType.PUBLISH, 3, "Sunny"],
        [PUBLISHER_CACHE_EXPIRED] as any,
    ];

    const lStatusSuccess: TSuccessfulRequest =
    {
        ResponseType: ERequestResponse.SUCCESS,
        Response: JSONBigInt.Stringify(lStatusResponse),
    };
    const lStatusRecoveryPromise: Promise<TSuccessfulRequest> = new Promise(
        (aResolve: (aValue: TSuccessfulRequest) => void): void =>
        {
            Delay(50).then(() =>
            {
                aResolve(lStatusSuccess);
            });
        },
    );
    const lWeatherSuccess: TSuccessfulRequest =
    {
        ResponseType: ERequestResponse.SUCCESS,
        Response: JSONBigInt.Stringify(lWeatherResponse),
    };
    const lFailedRecovery: TRequestTimeOut =
    {
        ResponseType: ERequestResponse.TIMEOUT,
        MessageNonce: 1337,
        RequestBody: ["bish", "bash", "bosh"],
    };

    lSendMock
        .onCall(0).returns(lStatusRecoveryPromise)
        .onCall(1).returns(Promise.resolve(lWeatherSuccess))
        .onCall(2).returns(Promise.resolve(lFailedRecovery))
        .onCall(3).returns(Promise.resolve(lStatusSuccess));

    await YieldToEventLoop();

    t.context.SendToReceiver(0, ["TopicToTest", EMessageType.PUBLISH, "3", "Hello4"]); // Send update with nonce 4
    await YieldToEventLoop();

    t.is(lCustomResults[0], "Hello4");
    t.is(lSendMock.getCall(0).args[0], JSONBigInt.Stringify(["TopicToTest", 0, 1, 2]));
    t.deepEqual(lCustomDroppedMessages[0], { Topic: "TopicToTest", Nonces: [0, 1, 2] });

    t.context.SendToReceiver(3, ["TopicToTest", EMessageType.PUBLISH, "1", "Hello2"]); // Send nonce 2 before recovery response
    await YieldToEventLoop();

    t.is(lCustomResults[1], "Hello2");

    clock.tick(50); // Trigger recovery response to resolve
    await YieldToEventLoop();

    t.is(lCustomResults[2], "Hello1");
    t.is(lCustomResults[3], "Hello3");

    t.is(lCustomResults[4], undefined);
    t.is(lCustomResults.length, 4);

    t.context.SendToReceiver(4, ["TopicToTest", EMessageType.PUBLISH, "3", "DUP_NONCE"]);   // Send duplicate messages
    await YieldToEventLoop();
    t.context.SendToReceiver(5, ["TopicToTest", EMessageType.PUBLISH, "1", "DUP_NONCE"]);  // Send duplicate messages
    await YieldToEventLoop();

    t.is(lCustomResults.length, 4);
    t.is(lCustomResults[4], undefined);

    t.context.SendToReceiver(1, ["Sydney", EMessageType.HEARTBEAT, "-1", ""]);
    t.is(
        lCustomSubscriber["mEndpoints"].get(DUMMY_ENDPOINTS.WEATHER_UPDATES.PublisherAddress)!
            .TopicEntries.get("Sydney")!.Nonce,
        -1,
    );

    await YieldToEventLoop();
    t.context.SendToReceiver(7, ["Sydney", EMessageType.HEARTBEAT, "4", ""]);
    await YieldToEventLoop();

    t.is(lSendMock.getCall(1).args[0], JSONBigInt.Stringify(["Sydney", 0, 1, 2, 3, 4]));
    t.is(lCustomResults[4], "Rainy");
    t.is(lCustomResults[5], "Misty");
    t.is(lCustomResults[6], "Cloudy");
    t.is(lCustomResults[7], "Sunny");
    t.is(lCustomResults[8], undefined);
    t.deepEqual(
        lCustomCacheErrors[0],
        {
            Endpoint: t.context.WeatherEndpoint,
            Topic: "Sydney",
            MessageNonce: 4,
        },
    );
    t.is(lCustomResults.length, 8);

    lCustomSubIds[2] = lCustomSubscriber.Subscribe(
        t.context.WeatherEndpoint,
        "Sydney",
        (aMsg: string): void => { lCustomResults.push(aMsg); },
    );

    await YieldToEventLoop();
    t.context.SendToReceiver(8, ["Sydney", EMessageType.PUBLISH, "3", "Overcast"]);
    await YieldToEventLoop();
    t.context.SendToReceiver(9, ["Sydney", EMessageType.PUBLISH, "2", "Sunny"]);
    await YieldToEventLoop();
    t.context.SendToReceiver(10, ["Sydney", EMessageType.PUBLISH, "1", "Cloudy"]);
    await YieldToEventLoop();
    t.context.SendToReceiver(11, ["Sydney", EMessageType.HEARTBEAT, "0", ""]);
    await YieldToEventLoop();
    t.context.SendToReceiver(12, ["Sydney", EMessageType.HEARTBEAT, "3", ""]);
    await YieldToEventLoop();
    t.context.SendToReceiver(13, ["Sydney", EMessageType.HEARTBEAT, "2", ""]);
    await YieldToEventLoop();
    t.context.SendToReceiver(14, ["Sydney", EMessageType.HEARTBEAT, "1", ""]);

    // console.log(lResults);
    t.is(lCustomResults.length, 8);

    await YieldToEventLoop();
    t.context.SendToReceiver(15, ["Sydney", EMessageType.PUBLISH, "5", "NewWeather"]);
    await YieldToEventLoop();

    t.is(lCustomResults[8], "NewWeather");
    t.is(lCustomResults[9], "NewWeather");

    // Test ZMQRequest.Send returns TRequestTimeOut
    t.context.SendToReceiver(16, ["Sydney", EMessageType.HEARTBEAT, "6", ""]);
    await YieldToEventLoop();

    t.is(lSendMock.getCall(2).args[0], JSONBigInt.Stringify(["Sydney", 6]));
    t.deepEqual(
        lCustomCacheErrors[1],
        {
            Endpoint: t.context.WeatherEndpoint,
            Topic: "Sydney",
            MessageNonce: 6,
        },
    );

    // Unknown Message Type Drops Silently
    t.is(lCustomResults.length, 10);
    t.is(lCustomCacheErrors.length, 2);

    t.context.SendToReceiver(6, ["TopicToTest", "UNKNOWN", "20", ""]);
    await YieldToEventLoop();

    // DroppedMessageWarn suppressed by default handlers
    t.context.SendToReceiver(2, ["TopicToTest", EMessageType.PUBLISH, "3", "Hello4"]); // Send update with nonce 4
    await YieldToEventLoop();

    t.is(lCustomResults.length, 10);
    t.is(lCustomCacheErrors.length, 2);

    lCustomSubscriber.Unsubscribe(lCustomSubIds[0]);
    lCustomSubscriber.Unsubscribe(lCustomSubIds[1]);
    lCustomSubscriber.Unsubscribe(lCustomSubIds[2]);
    lCustomSubscriber.Unsubscribe(lDefaultSubIds[0]);
    lCustomSubscriber.Unsubscribe(1337);  // In current version unsubscribing from non-existent subscription is a no-op

    // Send messages after unsubscribe
    t.is(lCustomResults.length, 10);
    t.is(lCustomCacheErrors.length, 2);

    t.context.SendToReceiver(18, ["TopicToTest", EMessageType.HEARTBEAT, "20", ""]);
    t.context.SendToReceiver(17, ["Sydney", EMessageType.HEARTBEAT, "20", ""]);
    await YieldToEventLoop();

    t.is(lCustomResults.length, 10);
    t.is(lCustomCacheErrors.length, 2);
});

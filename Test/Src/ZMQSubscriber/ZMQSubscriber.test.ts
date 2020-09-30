/* tslint:disable: no-string-literal */
import type { TestInterface } from "ava";
import anyTest, { ExecutionContext } from "ava";
import sinon from "sinon";
import { ImportMock, MockManager } from "ts-mock-imports";
import * as zmq from "zeromq";
import { TDroppedMessageWarning, TPublisherCacheError } from "../../../Src/Errors";
import JSONBigInt from "../../../Src/Utils/JSONBigInt";
import { EMessageType, PUBLISHER_CACHE_EXPIRED, TRecoveryResponse } from "../../../Src/ZMQPublisher";
import * as ZMQRequest from "../../../Src/ZMQRequest";
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
};

const test: TestInterface<TTestContext> = anyTest as TestInterface<TTestContext>;

test.before((t: ExecutionContext<TTestContext>): void =>
{
    // Unnecessary
});

test.beforeEach((t: ExecutionContext<TTestContext>): void =>
{
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
            "1",
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
                    (i + 1).toString(),
                    lTopic.test[i].data,
                ]);

                if (i + 1 === lTopic.test.length)
                {
                    // Duplicate final message to test drop handling
                    await YieldToEventLoop();
                    lTopic.test[i].publish([
                        lTopic.topic,
                        EMessageType.PUBLISH,
                        (i + 1).toString(),
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
    const lSubCallbacks: ((aValue: TAsyncIteratorResult) => void)[] = [];
    const lNewIterator = (aValue: TAsyncIteratorResult): { next(): Promise<TAsyncIteratorResult> } =>
    {
        return {
            async next(): Promise<TAsyncIteratorResult>
            {
                return new Promise((resolve: (aValue: TAsyncIteratorResult) => void): void =>
                {
                    lSubCallbacks.push(resolve);
                });
            },
        };
    };

    const lZmqSubscriberMock: MockManager<zmq.Subscriber> = ImportMock.mockClass<zmq.Subscriber>(zmq, "Subscriber");
    // @ts-ignore
    const lIteratorStub: Sinon.SinonStub = lZmqSubscriberMock.mock(Symbol.asyncIterator, lNewIterator);
    lIteratorStub.callsFake(lNewIterator);

    const lCacheErrors: TPublisherCacheError[] = [];
    const lDroppedMessages: TDroppedMessageWarning[] = [];
    const lSubscriber: ZMQSubscriber = new ZMQSubscriber(
        {
            CacheError: (aError: TPublisherCacheError): void => { lCacheErrors.push(aError); },
            DroppedMessageWarn: (aWarning: TDroppedMessageWarning): void => { lDroppedMessages.push(aWarning); },
        },
    );

    const lSubscriptionIds: number[] = [];
    const lResults: string[] = [];

    lSubscriptionIds[0] = lSubscriber.Subscribe(
        {
            PublisherAddress: DUMMY_ENDPOINTS.STATUS_UPDATES.PublisherAddress,
            RequestAddress: DUMMY_ENDPOINTS.STATUS_UPDATES.RequestAddress,
        },
        "TopicToTest",
        (aMsg: string): void => { lResults.push(aMsg); },
    );
    lSubscriptionIds[1] = lSubscriber.Subscribe(
        t.context.WeatherEndpoint,
        "Sydney",
        (aMsg: string): void => { lResults.push(aMsg); },
    );

    const lRequestMock: MockManager<ZMQRequest.ZMQRequest> = t.context.RequestMock;
    const lSendMock: sinon.SinonStub = lRequestMock.mock("Send");

    const lStatusResponse: TRecoveryResponse =
    [
        ["TopicToTest", EMessageType.PUBLISH, 1, "Hello1"],
        ["TopicToTest", EMessageType.PUBLISH, 2, "Hello2"],
        ["TopicToTest", EMessageType.PUBLISH, 3, "Hello3"],
    ];
    const lWeatherResponse: TRecoveryResponse =
    [
        ["Sydney", EMessageType.PUBLISH, 1, "Rainy"],
        ["Sydney", EMessageType.PUBLISH, 2, "Misty"],
        ["Sydney", EMessageType.PUBLISH, 3, "Cloudy"],
        ["Sydney", EMessageType.PUBLISH, 4, "Sunny"],
        [PUBLISHER_CACHE_EXPIRED] as any,
    ];
    lSendMock
        .onCall(0).returns(Promise.resolve(JSONBigInt.Stringify(lStatusResponse)))
        .onCall(1).returns(Promise.resolve(JSONBigInt.Stringify(lWeatherResponse)))
        .onCall(2).returns(Promise.resolve(
            {
                RequestId: 1337,
                Request: ["bish", "bash", "bosh"],
            },
        ));

    await YieldToEventLoop();
    lSubCallbacks[0]({ value: ["TopicToTest", EMessageType.PUBLISH, "4", "Hello4"], done: false });
    await YieldToEventLoop();

    t.is(lSendMock.getCall(0).args[0], JSONBigInt.Stringify(["TopicToTest", 1, 2, 3]));
    t.deepEqual(lDroppedMessages[0], { Topic: "TopicToTest", Nonces: [1, 2, 3] });
    t.is(lResults[0], "Hello4");    // Initial message first, followed by recovered messages in order
    t.is(lResults[1], "Hello1");
    t.is(lResults[2], "Hello2");
    t.is(lResults[3], "Hello3");

    lSubCallbacks[1]({ value: ["Sydney", EMessageType.HEARTBEAT, "0", ""], done: false });
    t.is(
        lSubscriber["mEndpoints"].get(DUMMY_ENDPOINTS.WEATHER_UPDATES.PublisherAddress)!
            .TopicEntries.get("Sydney")!.Nonce,
        0,
    );

    await YieldToEventLoop();
    lSubCallbacks[3]({ value: ["Sydney", EMessageType.HEARTBEAT, "5", ""], done: false });
    await YieldToEventLoop();

    t.is(lSendMock.getCall(1).args[0], JSONBigInt.Stringify(["Sydney", 1, 2, 3, 4, 5]));
    t.is(lResults[4], "Rainy");
    t.is(lResults[5], "Misty");
    t.is(lResults[6], "Cloudy");
    t.is(lResults[7], "Sunny");
    t.is(lResults[8], undefined);
    t.deepEqual(
        lCacheErrors[0],
        {
            Endpoint: t.context.WeatherEndpoint,
            Topic: "Sydney",
            MessageNonce: 5,
        },
    );
    t.is(lResults.length, 8);

    lSubscriptionIds[2] = lSubscriber.Subscribe(
        t.context.WeatherEndpoint,
        "Sydney",
        (aMsg: string): void => { lResults.push(aMsg); },
    );

    await YieldToEventLoop();
    lSubCallbacks[4]({ value: ["Sydney", EMessageType.PUBLISH, "5", "Overcast"], done: false });
    await YieldToEventLoop();
    lSubCallbacks[5]({ value: ["Sydney", EMessageType.PUBLISH, "4", "Sunny"], done: false });
    await YieldToEventLoop();
    lSubCallbacks[6]({ value: ["Sydney", EMessageType.PUBLISH, "3", "Cloudy"], done: false });
    await YieldToEventLoop();
    lSubCallbacks[7]({ value: ["Sydney", EMessageType.HEARTBEAT, "2", ""], done: false });
    await YieldToEventLoop();
    lSubCallbacks[8]({ value: ["Sydney", EMessageType.HEARTBEAT, "5", ""], done: false });
    await YieldToEventLoop();
    lSubCallbacks[9]({ value: ["Sydney", EMessageType.HEARTBEAT, "4", ""], done: false });
    await YieldToEventLoop();
    lSubCallbacks[10]({ value: ["Sydney", EMessageType.HEARTBEAT, "3", ""], done: false });

    t.is(lResults.length, 8);

    await YieldToEventLoop();
    lSubCallbacks[11]({ value: ["Sydney", EMessageType.PUBLISH, "6", "NewWeather"], done: false });
    await YieldToEventLoop();

    t.is(lResults[8], "NewWeather");
    t.is(lResults[9], "NewWeather");

    // Test ZMQRequest.Send returns TRequestTimeOut
    lSubCallbacks[12]({ value: ["Sydney", EMessageType.HEARTBEAT, "7", ""], done: false });
    await YieldToEventLoop();

    t.is(lSendMock.getCall(2).args[0], JSONBigInt.Stringify(["Sydney", 7]));
    t.deepEqual(
        lCacheErrors[1],
        {
            Endpoint: t.context.WeatherEndpoint,
            Topic: "Sydney",
            MessageNonce: 7,
        },
    );

    lSubscriber.Unsubscribe(lSubscriptionIds[0]);
    lSubscriber.Unsubscribe(lSubscriptionIds[1]);
    lSubscriber.Unsubscribe(lSubscriptionIds[2]);
    lSubscriber.Unsubscribe(1337);  // In current version unsubscribing from non-existent subscription is a no-op
});

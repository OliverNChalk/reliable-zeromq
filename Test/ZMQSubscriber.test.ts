/* tslint:disable: no-string-literal */
import type { TestInterface } from "ava";
import anyTest, { ExecutionContext } from "ava";
import sinon from "sinon";
import { ImportMock, MockManager } from "ts-mock-imports";
import * as zmq from "zeromq";
import { EEndpoint } from "../Src/Constants";
import JSONBigInt from "../Src/Utils/JSONBigInt";
import { EMessageType, TRecoveryResponse } from "../Src/ZMQPublisher";
import * as ZMQRequest from "../Src/ZMQRequest";
import { ZMQSubscriber } from "../Src/ZMQSubscriber";

type TAsyncIteratorResult = { value: any; done: boolean };
type TTestContext =
{
    RequestMock: MockManager<ZMQRequest.ZMQRequest>;
    TestData: any[];
};

const test: TestInterface<TTestContext> = anyTest as TestInterface<TTestContext> ;

async function WaitFor(aCondition: () => boolean): Promise<void>
{
    let lIteration: number = 0;
    while (!aCondition() && lIteration < 100)
    {
        await setImmediate((): void => {});
        ++lIteration;
    }

    if (lIteration === 100)
    {
        throw new Error("MAX WaitFor Iterations Reached");
    }
}

test.before((t: ExecutionContext<TTestContext>): void =>
{
    // Unnecessary
});

test.beforeEach((t: ExecutionContext<TTestContext>): void =>
{
    const lRequestMock: MockManager<ZMQRequest.ZMQRequest> = ImportMock.mockClass<ZMQRequest.ZMQRequest>(ZMQRequest, "ZMQRequest");

    t.context = {
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
    };
});

test.afterEach((t: ExecutionContext<TTestContext>): void =>
{
    sinon.restore();
    ImportMock.restore();
});

test.serial("Start, Subscribe, Recover, Repeat", async(t: ExecutionContext<TTestContext>): Promise<void> =>
{
    // SETUP
    // const clock: Sinon.SinonFakeTimers = Sinon.useFakeTimers();

    type TTopic = {
        topic: string;
        subId: number;
        test: {
            publish: (aZmqMessage: string[]) => void;
            data: string;
            result: string;
        }[];
    };
    type TTestDataResult = { [index in EEndpoint]: TTopic[] };

    const lTestDataResult: TTestDataResult =
    {
        [EEndpoint.STATUS_UPDATES]: [],
        [EEndpoint.WEATHER_UPDATES]: [],
    };

    const lStatusTopics: TTopic[] = lTestDataResult[EEndpoint.STATUS_UPDATES];
    const lWeatherTopics: TTopic[] = lTestDataResult[EEndpoint.WEATHER_UPDATES];

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

        function InsertByCount(aEndpoint: EEndpoint, aCount: number): void
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
            case 1:
            case 3:
                break;
            case 2:
                lSoloPublisher = lFunc;
                break;
            case 4:
                InsertByCount(EEndpoint.STATUS_UPDATES, aCount);
                break;
            case 5:
                InsertByCount(EEndpoint.WEATHER_UPDATES, aCount);
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

    lSubscriber.Start();
    lSubscriber.Stop();

    t.is(lSubscriber["mEndpoints"].size, 0);

    lSubscriber.Start();

    let lCalled: boolean = false;
    lSubscriber.Subscribe(EEndpoint.STATUS_UPDATES, "myFirstTopic", (aMsg: string): void =>
    {
        t.is(aMsg, JSONBigInt.Stringify(t.context.TestData));
        lCalled = true;
    });

    await setImmediate((): void => {});

    lSoloPublisher(
        [
            "myFirstTopic",
            EMessageType.PUBLISH,
            "1",
            JSONBigInt.Stringify(t.context.TestData),
        ],
    );
    await Promise.resolve();
    await setImmediate((): void => {});

    t.true(lCalled);

    lSubscriber.Stop();
    t.is(lSubscriber["mEndpoints"].size, 0);

    lSubscriber.Start();
    t.is(lSubscriber["mEndpoints"].size, 2);

    const lSubscribe = (aEndpoint: EEndpoint, aIndex: number): void =>
    {
        const lTopic: TTopic = lTestDataResult[aEndpoint][aIndex];
        let lCallNumber: number = 0;

        lTopic.subId = lSubscriber.Subscribe(aEndpoint, lTopic.topic, (aMsg: string): void =>
        {
            t.assert(lCallNumber < lTestDataResult[aEndpoint][aIndex].test.length);
            lTestDataResult[aEndpoint][aIndex].test[lCallNumber++].result = aMsg;
        });
    };

    lSubscribe(EEndpoint.STATUS_UPDATES, 0);
    lSubscribe(EEndpoint.STATUS_UPDATES, 1);
    lSubscribe(EEndpoint.STATUS_UPDATES, 2);
    lSubscribe(EEndpoint.WEATHER_UPDATES, 0);
    lSubscribe(EEndpoint.WEATHER_UPDATES, 1);

    for (const aEndpoint in lTestDataResult)
    {
        const lTopics: TTopic[] = lTestDataResult[aEndpoint];

        for (let aIndex: number = 0; aIndex < lTopics.length; ++aIndex)
        {
            const lTopic: TTopic = lTopics[aIndex];
            for (let i: number = 0; i < lTopic.test.length; ++i)
            {
                await WaitFor((): boolean => lTopic.test[i].publish !== undefined);
                lTopic.test[i].publish([
                    lTopic.topic,
                    EMessageType.PUBLISH,
                    (i + 1).toString(),
                    lTopic.test[i].data,
                ]);

                if (i + 1 === lTopic.test.length)
                {
                    // Duplicate final message to test drop handling
                    const lOldPublisher: (aZmqMessage: string[]) => void = lTopic.test[i].publish;
                    await WaitFor((): boolean => lTopic.test[i].publish !== lOldPublisher);
                    lTopic.test[i].publish([
                        lTopic.topic,
                        EMessageType.PUBLISH,
                        (i + 1).toString(),
                        "DUPLICATE MESSAGE: IGNORE DATA",
                    ]);
                }
            }
        }

        await setImmediate((): void => {});
    }

    await Promise.resolve();
    await setImmediate((): void => {});
    await process.nextTick((): void => {});

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

        await setImmediate((): void => {});
    }

    for (const aEndpoint in lTestDataResult)
    {
        const lTopics: TTopic[] = lTestDataResult[aEndpoint];

        for (let aIndex: number = 0; aIndex < lTopics.length; ++aIndex)
        {
            const lTopic: TTopic = lTopics[aIndex];

            lSubscriber.Unsubscribe(lTopic.subId);
        }

        t.is(lSubscriber["mEndpoints"].get(aEndpoint as EEndpoint)!.TopicEntries.size, 0);
    }

    t.throws((): void => { lSubscriber.Unsubscribe(0); });

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

    const lSubscriber: ZMQSubscriber = new ZMQSubscriber();

    const lSubscriptionIds: number[] = [];
    const lResults: string[] = [];

    lSubscriber.Start();
    lSubscriptionIds[0] = lSubscriber.Subscribe(
        EEndpoint.STATUS_UPDATES,
        "TopicToTest",
        (aMsg: string): void => { lResults.push(aMsg); },
    );
    lSubscriptionIds[1] = lSubscriber.Subscribe(
        EEndpoint.WEATHER_UPDATES,
        "Sydney",
        (aMsg: string): void => { lResults.push(aMsg); },
    );

    const lRequestMock: MockManager<ZMQRequest.ZMQRequest> = t.context.RequestMock;
    const lSendMock: sinon.SinonStub = lRequestMock.mock("Send");

    const lStatusResponse: TRecoveryResponse =
    [
        ["TopicToTest", EMessageType.PUBLISH, "1", "Hello1"],
        ["TopicToTest", EMessageType.PUBLISH, "2", "Hello2"],
        ["TopicToTest", EMessageType.PUBLISH, "3", "Hello3"],
    ];
    const lWeatherResponse: TRecoveryResponse =
    [
        ["Sydney", EMessageType.PUBLISH, "1", "Rainy"],
        ["Sydney", EMessageType.PUBLISH, "2", "Misty"],
        ["Sydney", EMessageType.PUBLISH, "3", "Cloudy"],
        ["Sydney", EMessageType.PUBLISH, "4", "Sunny"],
        ["Sydney", EMessageType.PUBLISH, "5", "Overcast"],
    ];
    lSendMock
        .onCall(0).returns(Promise.resolve(JSONBigInt.Stringify(lStatusResponse)))
        .onCall(1).returns(Promise.resolve(JSONBigInt.Stringify(lWeatherResponse)));

    await WaitFor((): boolean => lSubCallbacks[0] !== undefined);
    lSubCallbacks[0]({ value: ["TopicToTest", EMessageType.PUBLISH, "4", "Hello4"], done: false });

    await WaitFor((): boolean => { return lResults.length === 4; });

    t.is(lResults[0], "Hello4");    // Initial message first, followed by recovered messages in order
    t.is(lResults[1], "Hello1");
    t.is(lResults[2], "Hello2");
    t.is(lResults[3], "Hello3");

    lSubCallbacks[1]({ value: ["Sydney", EMessageType.HEARTBEAT, "0", ""], done: false });

    await setImmediate((): void => {});
    t.is(lSubscriber["mEndpoints"].get(EEndpoint.WEATHER_UPDATES)!.TopicEntries.get("Sydney")!.Nonce, 0);

    await WaitFor((): boolean => { return lSubCallbacks[3] !== undefined; });
    lSubCallbacks[3]({ value: ["Sydney", EMessageType.HEARTBEAT, "5", ""], done: false });
    await WaitFor((): boolean => { return lResults.length === 9; });

    t.is(lResults[4], "Rainy");
    t.is(lResults[5], "Misty");
    t.is(lResults[6], "Cloudy");
    t.is(lResults[7], "Sunny");
    t.is(lResults[8], "Overcast");

    lSubscriptionIds[2] = lSubscriber.Subscribe(
        EEndpoint.WEATHER_UPDATES,
        "Sydney",
        (aMsg: string): void => { lResults.push(aMsg); },
    );

    t.is(lSubscriber["mSubscriptions"].size, 3);
    t.is(lSubscriber["mEndpoints"].get(EEndpoint.WEATHER_UPDATES)!.TopicEntries.get("Sydney")!.Callbacks.size, 2);
    t.is(lResults.length, 9);

    await WaitFor((): boolean => { return lSubCallbacks[4] !== undefined; });
    lSubCallbacks[4]({ value: ["Sydney", EMessageType.PUBLISH, "5", "Overcast"], done: false });
    await WaitFor((): boolean => { return lSubCallbacks[5] !== undefined; });
    lSubCallbacks[5]({ value: ["Sydney", EMessageType.PUBLISH, "4", "Sunny"], done: false });
    await WaitFor((): boolean => { return lSubCallbacks[6] !== undefined; });
    lSubCallbacks[6]({ value: ["Sydney", EMessageType.PUBLISH, "3", "Cloudy"], done: false });
    await WaitFor((): boolean => { return lSubCallbacks[7] !== undefined; });
    lSubCallbacks[7]({ value: ["Sydney", EMessageType.HEARTBEAT, "2", ""], done: false });
    await WaitFor((): boolean => { return lSubCallbacks[8] !== undefined; });
    lSubCallbacks[8]({ value: ["Sydney", EMessageType.HEARTBEAT, "5", ""], done: false });
    await WaitFor((): boolean => { return lSubCallbacks[9] !== undefined; });
    lSubCallbacks[9]({ value: ["Sydney", EMessageType.HEARTBEAT, "4", ""], done: false });
    await WaitFor((): boolean => { return lSubCallbacks[10] !== undefined; });
    lSubCallbacks[10]({ value: ["Sydney", EMessageType.HEARTBEAT, "3", ""], done: false });

    t.is(lResults.length, 9);

    await WaitFor((): boolean => { return lSubCallbacks[11] !== undefined; });
    lSubCallbacks[11]({ value: ["Sydney", EMessageType.PUBLISH, "6", "NewWeather"], done: false });
    await WaitFor((): boolean => { return lResults.length > 9; });

    t.is(lResults[9], "NewWeather");
    t.is(lResults[10], "NewWeather");

    t.is(lSubscriber["mSubscriptions"].size, 3);
    t.is(lSubscriber["mEndpoints"].get(EEndpoint.STATUS_UPDATES)!.TopicEntries.get("TopicToTest")!.Callbacks.size, 1);
    t.is(lSubscriber["mEndpoints"].get(EEndpoint.WEATHER_UPDATES)!.TopicEntries.get("Sydney")!.Callbacks.size, 2);

    lSubscriber.Unsubscribe(lSubscriptionIds[0]);
    lSubscriber.Unsubscribe(lSubscriptionIds[1]);

    t.is(lSubscriber["mSubscriptions"].size, 1);
    t.is(lSubscriber["mEndpoints"].get(EEndpoint.STATUS_UPDATES)!.TopicEntries.size, 0);
    t.is(lSubscriber["mEndpoints"].get(EEndpoint.WEATHER_UPDATES)!.TopicEntries.get("Sydney")!.Callbacks.size, 1);

    lSubscriber.Unsubscribe(lSubscriptionIds[2]);

    t.is(lSubscriber["mSubscriptions"].size, 0);
    t.is(lSubscriber["mEndpoints"].get(EEndpoint.STATUS_UPDATES)!.TopicEntries.size, 0);
    t.is(lSubscriber["mEndpoints"].get(EEndpoint.WEATHER_UPDATES)!.TopicEntries.size, 0);
});

test.todo("Test error cases after ErrorEmitter added");

/* tslint:disable: no-string-literal */
import type { TestInterface } from "ava";
import anyTest, { ExecutionContext } from "ava";
import * as Sinon from "sinon";
import { ImportMock, MockManager } from "ts-mock-imports";
import * as zmq from "zeromq";
import { EEndpoint } from "../Src/Constants";
import JSONBigInt from "../Src/Utils/JSONBigInt";
import { EMessageType } from "../Src/ZMQPublisher";
import * as ZMQRequest from "../Src/ZMQRequest";
import { ZMQSubscriber } from "../Src/ZMQSubscriber";

type TAsyncIteratorResult = { value: any; done: boolean };
type TTestContext =
{
    RequestMock: MockManager<ZMQRequest.ZMQRequest>;
    TestData: any[];
};

const test: TestInterface<TTestContext> = anyTest as TestInterface<TTestContext> ;

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
    Sinon.restore();
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

    async function WaitFor(aCondition: () => boolean): Promise<void>
    {
        while (!aCondition())
        {
            await setImmediate((): void => {});
        }
    }

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

test.todo("Recover Missing Messages");
test.todo("Multiple Subscribers");
test.todo("Multiple Callbacks");
test.todo("Test error cases after ErrorEmitter added");
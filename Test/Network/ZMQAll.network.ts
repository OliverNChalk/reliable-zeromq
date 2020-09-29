/* tslint:disable: no-string-literal */
import type { TestInterface } from "ava";
import anyTest, { ExecutionContext } from "ava";
import * as sinon from "sinon";
import { ImportMock } from "ts-mock-imports";
import { Delay } from "../../Src/Utils/Delay";
import JSONBigInt from "../../Src/Utils/JSONBigInt";
import { EPublishMessage, TPublishMessage, ZMQPublisher } from "../../Src/ZMQPublisher";
import { TRequestResponse, ZMQRequest } from "../../Src/ZMQRequest";
import { ZMQResponse } from "../../Src/ZMQResponse";
import { TSubscriptionEndpoints, ZMQSubscriber } from "../../Src/ZMQSubscriber/ZMQSubscriber";
import { DUMMY_ENDPOINTS } from "../Helpers/DummyEndpoints.data";

type TTestContext =
{
    ResponderEndpoint: string;
    TestData: any[];
};

const test: TestInterface<TTestContext> = anyTest as TestInterface<TTestContext> ;

test.before((t: ExecutionContext<TTestContext>): void =>
{
    // Unnecessary
});

test.beforeEach((t: ExecutionContext<TTestContext>): void =>
{
    t.context = {
        ResponderEndpoint: "tcp://127.0.0.1:3241",
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

test.serial("ZMQRequest: Start, Send, Receive, Close", async(t: ExecutionContext<TTestContext>): Promise<void> =>
{
    const lExpected: { code: string; data: any } =
    {
        code: "success",
        data: undefined!,
    };
    const lResponse: ZMQResponse = new ZMQResponse(t.context.ResponderEndpoint, async(aMsg: string): Promise<string> =>
    {
        let lResult: string;
        try
        {
            lResult = JSONBigInt.Parse(aMsg);
        }
        catch (e)
        {
            lResult = aMsg as string;
        }

        return JSONBigInt.Stringify({
            code: "success",
            data: lResult,
        });
    });

    const lRequester: ZMQRequest = new ZMQRequest(t.context.ResponderEndpoint);
    await lRequester.Open();

    const lPromiseResult: TRequestResponse = await lRequester.Send(JSONBigInt.Stringify(t.context.TestData));
    lExpected.data = t.context.TestData;

    if (typeof lPromiseResult !== "string")
    {
        t.fail(`Request failed: ${lPromiseResult.RequestId}`);
    }
    else
    {
        t.deepEqual(JSONBigInt.Parse(lPromiseResult), lExpected);
    }

    const lNotThrowResult: TRequestResponse = await lRequester.Send("this should not throw");
    lExpected.data = "this should not throw";

    if (typeof lNotThrowResult !== "string")
    {
        t.fail(`Request failed: ${lNotThrowResult.RequestId}`);
    }
    else
    {
        t.deepEqual(JSONBigInt.Parse(lNotThrowResult), lExpected);
    }

    lRequester.Close();
    lResponse.Close();
});

test.serial("ZMQResponse: Start, Receive, Close", async(t: ExecutionContext<TTestContext>): Promise<void> =>
{
    let lResponder = async(aMsg: string): Promise<string> => "world";
    const lResponderRouter = (aMsg: string): Promise<string> =>
    {
        return lResponder(aMsg);    // Necessary so we can update lResponder throughout
    };

    t.context.ResponderEndpoint = "tcp://127.0.0.1:4276";
    const lResponse: ZMQResponse = new ZMQResponse(t.context.ResponderEndpoint, lResponderRouter);
    const lRequester: ZMQRequest = new ZMQRequest(t.context.ResponderEndpoint);

    await lRequester.Open();

    const lFirstResponse: TRequestResponse = await lRequester.Send("hello");

    t.is(lFirstResponse, "world");
    t.is(lResponse["mCachedRequests"].size, 1);

    lResponder = async(aMsg: string): Promise<string> => aMsg + " response";
    const lSecondResponse: TRequestResponse = await lRequester.Send("hello");

    t.is(lSecondResponse, "hello response");
    t.is(lResponse["mCachedRequests"].size, 2);

    lResponse.Close();
    lRequester.Close();
});

test.serial("ZMQPublisher & ZMQSubscriber", async(t: ExecutionContext<TTestContext>): Promise<void> =>
{
    const lStatusUpdatePublisher: ZMQPublisher = new ZMQPublisher(
        {
            PublisherAddress: DUMMY_ENDPOINTS.STATUS_UPDATES.PublisherAddress,
            RequestAddress: DUMMY_ENDPOINTS.STATUS_UPDATES.RequestAddress,
        },
        {
            CacheError: undefined!,
            HighWaterMarkWarning: undefined!,
        },
    );
    const lWeatherUpdatePublisher: ZMQPublisher = new ZMQPublisher(
        {
            PublisherAddress: DUMMY_ENDPOINTS.WEATHER_UPDATES.PublisherAddress,
            RequestAddress: DUMMY_ENDPOINTS.WEATHER_UPDATES.RequestAddress,
        },
        {
            CacheError: undefined!,
            HighWaterMarkWarning: undefined!,
        },
    );
    const lSubscriber: ZMQSubscriber = new ZMQSubscriber({ CacheError: undefined!, DroppedMessageWarn: undefined! });

    await lStatusUpdatePublisher.Open();
    await lWeatherUpdatePublisher.Open();

    type TTestDataResult =
    {
        [index: string]: {
            Publisher: ZMQPublisher;
            Topics: {
                [index: string]: {
                    data: string[];
                    result: string[];
                };
            };
        };
    };

    const lTestDataResult: TTestDataResult =
    {
        [DUMMY_ENDPOINTS.STATUS_UPDATES.PublisherAddress]: {
            Publisher: lStatusUpdatePublisher,
            Topics: {},
        },
        [DUMMY_ENDPOINTS.WEATHER_UPDATES.PublisherAddress]: {
            Publisher: lWeatherUpdatePublisher,
            Topics: {},
        },
    };

    lTestDataResult[DUMMY_ENDPOINTS.STATUS_UPDATES.PublisherAddress].Topics["TopicA"]
        = { data: ["myTestMessage"], result: [] };
    lTestDataResult[DUMMY_ENDPOINTS.STATUS_UPDATES.PublisherAddress].Topics["TopicB"]
        = { data: ["myTestMessage"], result: [] };
    lTestDataResult[DUMMY_ENDPOINTS.STATUS_UPDATES.PublisherAddress].Topics["TopicC"]
        = { data: ["myTestMessage"], result: [] };
    lTestDataResult[DUMMY_ENDPOINTS.WEATHER_UPDATES.PublisherAddress].Topics["Sydney"]
        = { data: ["sunny"], result: [] };
    lTestDataResult[DUMMY_ENDPOINTS.WEATHER_UPDATES.PublisherAddress].Topics["Newcastle"]
        = { data: ["cloudy"], result: [] };

    const lSaveResult = (aEndpoint: string, aTopic: string, aNonce: number, aMessage: string): void =>
    {
        lTestDataResult[aEndpoint].Topics[aTopic].result[aNonce - 1] = aMessage;
    };

    const lSubscribe = (aEndpoint: TSubscriptionEndpoints, aTopic: string): void =>
    {
        lSubscriber.Subscribe(aEndpoint, aTopic, (aMsg: string): void =>
        {
            lTestDataResult[aEndpoint.PublisherAddress].Publisher["mMessageCaches"].get(aTopic)!.forEach(
            (aValue: TPublishMessage, aKey: number): void =>
            {
                if (aValue[EPublishMessage.Message] === aMsg)
                {
                    lSaveResult(aEndpoint.PublisherAddress, aTopic, aKey, aMsg);
                }
            });
        });
    };

    lSubscribe({
        PublisherAddress: DUMMY_ENDPOINTS.STATUS_UPDATES.PublisherAddress,
        RequestAddress: DUMMY_ENDPOINTS.STATUS_UPDATES.RequestAddress,
    }, "TopicA");
    lSubscribe({
        PublisherAddress: DUMMY_ENDPOINTS.STATUS_UPDATES.PublisherAddress,
        RequestAddress: DUMMY_ENDPOINTS.STATUS_UPDATES.RequestAddress,
    }, "TopicB");
    lSubscribe({
        PublisherAddress: DUMMY_ENDPOINTS.STATUS_UPDATES.PublisherAddress,
        RequestAddress: DUMMY_ENDPOINTS.STATUS_UPDATES.RequestAddress,
    }, "TopicC");
    lSubscribe({
        PublisherAddress: DUMMY_ENDPOINTS.WEATHER_UPDATES.PublisherAddress,
        RequestAddress: DUMMY_ENDPOINTS.WEATHER_UPDATES.RequestAddress,
    }, "Newcastle");
    lSubscribe({
        PublisherAddress: DUMMY_ENDPOINTS.WEATHER_UPDATES.PublisherAddress,
        RequestAddress: DUMMY_ENDPOINTS.WEATHER_UPDATES.RequestAddress,
    }, "Sydney");

    for (const aEndpoint in lTestDataResult)
    {
        const lPublisher: ZMQPublisher = lTestDataResult[aEndpoint].Publisher;
        for (const aTopic in lTestDataResult[aEndpoint].Topics)
        {
            for (const aData of lTestDataResult[aEndpoint].Topics[aTopic].data)
            {
                await lPublisher.Publish(aTopic, aData);
            }
        }
    }

    while
    (
            lSubscriber["mEndpoints"].get(DUMMY_ENDPOINTS.STATUS_UPDATES.PublisherAddress)!
                .TopicEntries.get("TopicA")!.Nonce < 1
        ||  lSubscriber["mEndpoints"].get(DUMMY_ENDPOINTS.STATUS_UPDATES.PublisherAddress)!
                .TopicEntries.get("TopicB")!.Nonce < 1
        ||  lSubscriber["mEndpoints"].get(DUMMY_ENDPOINTS.STATUS_UPDATES.PublisherAddress)!
                .TopicEntries.get("TopicC")!.Nonce < 1
        ||  lSubscriber["mEndpoints"].get(DUMMY_ENDPOINTS.WEATHER_UPDATES.PublisherAddress)!
                .TopicEntries.get("Sydney")!.Nonce < 1
        ||  lSubscriber["mEndpoints"].get(DUMMY_ENDPOINTS.WEATHER_UPDATES.PublisherAddress)!
                .TopicEntries.get("Newcastle")!.Nonce < 1
    )
    {
        await Delay(100);
    }

    for (const aEndpoint in lTestDataResult)
    {
        for (const aTopic in lTestDataResult[aEndpoint].Topics)
        {
            const lTestData: string[] = lTestDataResult[aEndpoint].Topics[aTopic].data;
            const lTestResult: string[] = lTestDataResult[aEndpoint].Topics[aTopic].result;
            for (let i: number = 0; i < lTestData.length; ++i)
            {
                t.is(lTestData[i], lTestResult[i]);
            }
        }
    }

    lSubscriber.Close();
    lStatusUpdatePublisher.Close();
    lWeatherUpdatePublisher.Close();
});

test.todo("Multiple Subscribers");

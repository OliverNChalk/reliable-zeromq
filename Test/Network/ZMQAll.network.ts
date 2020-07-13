/* tslint:disable: no-string-literal */
import type { TestInterface } from "ava";
import anyTest, { ExecutionContext } from "ava";
import * as sinon from "sinon";
import { ImportMock } from "ts-mock-imports";
import { DUMMY_ENDPOINTS } from "../../Src/Constants";
import { Delay } from "../../Src/Utils/Delay";
import JSONBigInt from "../../Src/Utils/JSONBigInt";
import { ZMQPublisher } from "../../Src/ZMQPublisher";
import { ZMQRequest } from "../../Src/ZMQRequest";
import { ZMQResponse } from "../../Src/ZMQResponse";
import { TSubscriptionEndpoints, ZMQSubscriber } from "../../Src/ZMQSubscriber";

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

test.serial("ZMQRequest: Start, Send, Receive, Repeat", async(t: ExecutionContext<TTestContext>): Promise<void> =>
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
    const lRequest: ZMQRequest = new ZMQRequest(t.context.ResponderEndpoint);

    lRequest.Start();
    await lResponse.Start();

    const lPromiseResult: string = await lRequest.Send(JSONBigInt.Stringify(t.context.TestData));
    lExpected.data = t.context.TestData;

    t.deepEqual(JSONBigInt.Parse(lPromiseResult), lExpected);

    lRequest.Stop();

    await t.throwsAsync(async(): Promise<void> =>
    {
        await lRequest.Send("this should throw");
    });

    lRequest.Start();

    const lNotThrowResult: string = await lRequest.Send("this should not throw");
    lExpected.data = "this should not throw";

    t.deepEqual(JSONBigInt.Parse(lNotThrowResult), lExpected);

    lRequest.Stop();
    lResponse.Stop();
});

test.serial("ZMQResponse: Start, Receive, Repeat", async(t: ExecutionContext<TTestContext>): Promise<void> =>
{
    let lResponder = async(aMsg: string): Promise<string> => "world";
    const lResponderRouter = (aMsg: string): Promise<string> =>
    {
        return lResponder(aMsg);    // Necessary so we can update lResponder throughout
    };

    t.context.ResponderEndpoint = "tcp://127.0.0.1:4276";
    const lRequest: ZMQRequest = new ZMQRequest(t.context.ResponderEndpoint);
    const lResponse: ZMQResponse = new ZMQResponse(t.context.ResponderEndpoint, lResponderRouter);

    lRequest.Start();

    await lResponse.Start();
    const lFirstResponse: string = await lRequest.Send("hello");

    t.is(lFirstResponse, "world");
    t.is(lResponse["mCachedRequests"].size, 1);

    lResponse.Stop();
    await lResponse.Start();

    lResponder = async(aMsg: string): Promise<string> => aMsg + " response";
    const lSecondResponse: string = await lRequest.Send("hello");

    t.is(lSecondResponse, "hello response");
    t.is(lResponse["mCachedRequests"].size, 2);

    lResponse.Stop();
    lRequest.Stop();
});

test.serial("ZMQPublisher & ZMQSubscriber", async(t: ExecutionContext<TTestContext>): Promise<void> =>
{
    const lStatusUpdatePublisher: ZMQPublisher = new ZMQPublisher({
        PublisherAddress: DUMMY_ENDPOINTS.STATUS_UPDATES.PublisherAddress,
        RequestAddress: DUMMY_ENDPOINTS.STATUS_UPDATES.RequestAddress,
    });
    const lWeatherUpdatePublisher: ZMQPublisher = new ZMQPublisher({
        PublisherAddress: DUMMY_ENDPOINTS.WEATHER_UPDATES.PublisherAddress,
        RequestAddress: DUMMY_ENDPOINTS.WEATHER_UPDATES.RequestAddress,
    });
    const lSubscriber: ZMQSubscriber = new ZMQSubscriber();

    await lSubscriber.Start();
    await lStatusUpdatePublisher.Start();
    await lWeatherUpdatePublisher.Start();

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
            (aValue: string[], aKey: number): void =>
            {
                if (aValue[3] === aMsg)
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

    lSubscriber.Stop();
    lStatusUpdatePublisher.Stop();
    lWeatherUpdatePublisher.Stop();
});

test.todo("Multiple Subscribers");

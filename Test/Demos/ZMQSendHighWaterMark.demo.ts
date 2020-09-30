/* tslint:disable no-console tslint:disable no-string-literal */
import Config from "../../Src/Config";
import { TDroppedMessageWarning, TPublisherCacheError } from "../../Src/Errors";
import { Delay } from "../../Src/Utils/Delay";
import { THighWaterMarkWarning, ZMQPublisher } from "../../Src/ZMQPublisher";
import { TSubscriptionEndpoints, ZMQSubscriber } from "../../Src/ZMQSubscriber/ZMQSubscriber";
import TestEndpoint from "../Helpers/TestEndpoint";

async function RunHWMDemo(aHighWaterMark: number): Promise<void>
{
    console.log(`Running with HWM of ${aHighWaterMark}`);
    const lEndpoint: TSubscriptionEndpoints =
    {
        PublisherAddress: TestEndpoint.GetEndpoint("HWMPublisherAddress"),
        RequestAddress: TestEndpoint.GetEndpoint("HWMRequestAddress"),
    };

    const lPubErrors: any[] = [];
    const lSubErrors: any[] = [];
    const lStatusUpdatePublisher: ZMQPublisher = new ZMQPublisher(
        lEndpoint,
        {
            HighWaterMarkWarning: (aWarning: THighWaterMarkWarning): void => { lPubErrors.push(aWarning); },
        },
    );
    await lStatusUpdatePublisher.Open();
    lStatusUpdatePublisher["mPublisher"].sendHighWaterMark = aHighWaterMark;
    await lStatusUpdatePublisher["mPublisher"].bind(lEndpoint.PublisherAddress);

    const lSubscriber: ZMQSubscriber = new ZMQSubscriber(
        {
            CacheError: (aError: TPublisherCacheError): void => { lSubErrors.push(aError); },
            DroppedMessageWarn: (aWarning: TDroppedMessageWarning): void => { lSubErrors.push(aWarning); },
        },
    );

    const lSentMap: Map<string, boolean> = new Map();
    const lReceivedMap: Map<string, boolean> = new Map();

    lSubscriber.Subscribe(
        lEndpoint,
        "HWM_TEST",
        (aMessage: string): void =>
        {
            lReceivedMap.set(aMessage, true);
        },
    );

    await Delay(100);
    for (let i: number = 1; i <= 100; ++i)
    {
        const lMessage: string = `TEST_${i}`;
        lStatusUpdatePublisher.Publish("HWM_TEST", lMessage);
        lSentMap.set(lMessage, true);
    }
    await Delay(2 * Config.HeartBeatInterval);

    lSubscriber.Close();
    lStatusUpdatePublisher.Close();

    console.log(`PubErrors: ${lPubErrors.length}`);
    console.log(`SubErrors: ${lSubErrors.length}`);

    // Find missing values
    lSentMap.forEach((aValue: boolean, aMessageKey: string) =>
    {
        if (!lReceivedMap.has(aMessageKey))
        {
            console.log(aMessageKey, "not received!");
        }
    });
}

async function RunAll(): Promise<void>
{
    await RunHWMDemo(1);
    await RunHWMDemo(2);
    await RunHWMDemo(5);
    await RunHWMDemo(10);
    await RunHWMDemo(1);
    await RunHWMDemo(2);
    await RunHWMDemo(5);
    await RunHWMDemo(10);
    await RunHWMDemo(1);
    await RunHWMDemo(2);
    await RunHWMDemo(5);
    await RunHWMDemo(10);
    await RunHWMDemo(1);
    await RunHWMDemo(2);
    await RunHWMDemo(5);
    await RunHWMDemo(10);
    await RunHWMDemo(1);
    await RunHWMDemo(2);
    await RunHWMDemo(5);
    await RunHWMDemo(10);
    await RunHWMDemo(1);
    await RunHWMDemo(2);
    await RunHWMDemo(5);
    await RunHWMDemo(10);
    await RunHWMDemo(1);
    await RunHWMDemo(2);
    await RunHWMDemo(5);
    await RunHWMDemo(10);
}

RunAll();

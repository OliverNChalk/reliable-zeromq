/* tslint:disable no-console tslint:disable no-string-literal */
const logRunning: any = require("why-is-node-running");
import Config from "../../Src/Config";
import { TCacheError } from "../../Src/Errors";
import { Delay } from "../../Src/Utils/Delay";
import { THighWaterMarkWarning, ZMQPublisher } from "../../Src/ZMQPublisher";
import { TRequestResponse, ZMQRequest } from "../../Src/ZMQRequest";
import { ZMQResponse } from "../../Src/ZMQResponse";
import { TDroppedMessageWarning, TSubscriptionEndpoints, ZMQSubscriber } from "../../Src/ZMQSubscriber/ZMQSubscriber";
import TestEndpoint from "../Helpers/TestEndpoint";

let lStartExitTime: number;

async function RunSubDemo(aHighWaterMark: number): Promise<void>
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
            CacheError: (aError: TCacheError): void => { lPubErrors.push(aError); },
            HighWaterMarkWarning: (aWarning: THighWaterMarkWarning): void => { lPubErrors.push(aWarning); },
        },
    );
    await lStatusUpdatePublisher.Open();
    lStatusUpdatePublisher["mPublisher"].sendHighWaterMark = aHighWaterMark;
    await lStatusUpdatePublisher["mPublisher"].bind(lEndpoint.PublisherAddress);

    const lSubscriber: ZMQSubscriber = new ZMQSubscriber(
        {
            CacheError: (aError: TCacheError): void => { lSubErrors.push(aError); },
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
    for (let i: number = 1; i <= 1_000; ++i)
    {
        const lMessage: string = `TEST_${i}`;
        lStatusUpdatePublisher.Publish("HWM_TEST", lMessage);
        lSentMap.set(lMessage, true);
    }
    await Delay(2 * Config.HeartBeatInterval);

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

    lSubscriber.Close();

    lStatusUpdatePublisher.Publish("HWM_TEST", "LATE_PUBLISH");
    await Delay(100);

    lStatusUpdatePublisher.Close();
    lStartExitTime = Date.now();
}

let lCount: number = 0;

async function LogActive(): Promise<void>
{
    while (lCount < 20)
    {
        console.log("Logging items keeping NodeJS alive", lCount++);
        logRunning();
        await Delay(500);
    }
}

async function RunReqDemo(): Promise<void>
{
    const lEndpoint: string = TestEndpoint.GetEndpoint("ResponseExit");

    const lResponder: ZMQResponse = new ZMQResponse(
        lEndpoint,
        (): Promise<string> => Promise.resolve("test"),
    );
    const lRequester: ZMQRequest = new ZMQRequest(
        lEndpoint,
    );

    const lResult: TRequestResponse = await lRequester.Send("test1");
    console.log(lResult);

    await Delay(200);

    lResponder.Close();
    lRequester.Close();
    lStartExitTime = Date.now();
}

RunReqDemo();
LogActive();

process.on("exit", () => console.log(`NodeJS took ${Date.now() - lStartExitTime}ms to exit`));

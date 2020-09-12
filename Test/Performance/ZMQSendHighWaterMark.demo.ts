/* tslint:disable */
import type { TestInterface } from "ava";
import anyTest, { ExecutionContext } from "ava";
import * as sinon from "sinon";
import { ImportMock } from "ts-mock-imports";
import { Delay } from "../../Src/Utils/Delay";
import JSONBigInt from "../../Src/Utils/JSONBigInt";
import { EPublishMessage, TPublishMessage, TRecoveryRequest, ZMQPublisher } from "../../Src/ZMQPublisher";
import { TRequestResponse, ZMQRequest } from "../../Src/ZMQRequest";
import { ZMQResponse } from "../../Src/ZMQResponse";
import { TSubscriptionEndpoints, ZMQSubscriber } from "../../Src/ZMQSubscriber/ZMQSubscriber";
import { DUMMY_ENDPOINTS } from "../Helpers/DummyEndpoints.data";

async function RunHWMTest(): Promise<void>
{
    const lStatusUpdatePublisher: ZMQPublisher = new ZMQPublisher(
        {
            PublisherAddress: DUMMY_ENDPOINTS.STATUS_UPDATES.PublisherAddress,
            RequestAddress: DUMMY_ENDPOINTS.STATUS_UPDATES.RequestAddress,
        },
        {
            CacheError: (): void => {},
        },
    );
    await lStatusUpdatePublisher.Open();
    const lSubscriber: ZMQSubscriber = new ZMQSubscriber({ CacheError: (): void => {} });
    lSubscriber.SetWarnHandlers(
        {
            MessageRecovery: (aRecoveryRequest: TRecoveryRequest): void =>
            {
                console.warn(aRecoveryRequest);
            },
        },
    );

    const lSentMap: Map<string, boolean> = new Map();
    const lReceivedMap: Map<string, boolean> = new Map();
    let lReceivedCount: number = 0;

    const lSubId: number = lSubscriber.Subscribe(DUMMY_ENDPOINTS.STATUS_UPDATES, "HWM_TEST", (aMessage: string): void =>
    {
        ++lReceivedCount;
        lReceivedMap.set(aMessage, true);

        if (lReceivedCount === 2_000)
        {
            console.log("Finished receiving at:", Date.now());
        }
    });

    console.log("SubscriptionId:", lSubId);

    await Delay(100);

    console.log("Started sending at:", Date.now());
    for (let i: number = 1; i <= 2_000; ++i)
    {
        const lMessage: string = `TEST_${i}`;
        lStatusUpdatePublisher.Publish("HWM_TEST", lMessage);
        lSentMap.set(lMessage, true);

        // console.log(i, "sent: ", lMessage);
    }
    await Delay(500);

    lSubscriber.Close();
    lStatusUpdatePublisher.Close();

    // Find missing values
    lSentMap.forEach((aValue: boolean, aMessageKey: string) =>
    {
        if (!lReceivedMap.has(aMessageKey))
        {
            console.log(aMessageKey, "not received!");
        }
    });
}

RunHWMTest();

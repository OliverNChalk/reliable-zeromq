/* tslint:disable no-console */
import { Delay } from "../../Src/Utils/Delay";
import { ZMQPublisher } from "../../Src/ZMQPublisher";
import { ZMQSubscriber } from "../../Src/ZMQSubscriber/ZMQSubscriber";
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

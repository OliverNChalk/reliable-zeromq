/* tslint:disable: no-string-literal */
import type { TestInterface } from "ava";
import anyTest, { ExecutionContext } from "ava";
import { MockManager } from "ts-mock-imports";
import * as ZMQRequest from "../../../Src/ZMQRequest";
import TopicEntry from "../../../Src/ZMQSubscriber/TopicEntry";
import { TSubscriptionEndpoints } from "../../../Src/ZMQSubscriber/ZMQSubscriber";
type TTestContext =
{
    RequestMock: MockManager<ZMQRequest.ZMQRequest>;
    TestData: any[];
    StatusEndpoint: TSubscriptionEndpoints;
    WeatherEndpoint: TSubscriptionEndpoints;
};

const test: TestInterface<TTestContext> = anyTest as TestInterface<TTestContext>;

test("Process Heartbeats & Publishes", (t: ExecutionContext<TTestContext>): void =>
{
    const lSubscriptionEndpoints: TSubscriptionEndpoints =
    {
        PublisherAddress: "",
        RequestAddress: "",
    };
    const lTopic: string = "MyTopicA";

    const lRecoveredMessages: number[][] = [];
    const lRecoveryHandler = (aEndpoint: TSubscriptionEndpoints, aTopic: string, aMessageIds: number[]): void =>
    {
        t.deepEqual(aEndpoint, lSubscriptionEndpoints);
        t.is(aTopic, lTopic);

        lRecoveredMessages.push(aMessageIds);
    };

    const lTopicEntry: TopicEntry = new TopicEntry(lSubscriptionEndpoints, lTopic, lRecoveryHandler);

    const lCallbackCalls: string[] = [];
    lTopicEntry.Callbacks.set(0, (aMessage: string) =>
    {
        lCallbackCalls.push(aMessage);
    });

    lTopicEntry.ProcessHeartbeatMessage(2); // Recover 0, 1 & 2 (nonce starts from zero)
    lTopicEntry.ProcessPublishMessage(5, "MySixthMessage");   // Call Callback : Recover 3 & 4
    lTopicEntry.ProcessPublishMessage(4, "MyFifthMessage");   // Call Callback : No Recover
    lTopicEntry.ProcessHeartbeatMessage(8); // Recover 6, 7, & 8
    lTopicEntry.ProcessHeartbeatMessage(8); // No Recover
    lTopicEntry.ProcessPublishMessage(9, "MyTenthMessage");   // Call Callback : No Recover

    t.deepEqual(lRecoveredMessages[0], [0, 1, 2]);
    t.deepEqual(lRecoveredMessages[1], [3, 4]);
    // 3rd call ignored
    t.deepEqual(lRecoveredMessages[2], [6, 7, 8]);
    // 4th call ignored
    // 5th call ignored

    t.is(lCallbackCalls.length, 3);
    t.is(lCallbackCalls[0], "MySixthMessage");
    t.is(lCallbackCalls[1], "MyFifthMessage");
    t.is(lCallbackCalls[2], "MyTenthMessage");

    t.is(lTopicEntry.Nonce, 9);
    t.is(lTopicEntry.Callbacks.size, 1);
});

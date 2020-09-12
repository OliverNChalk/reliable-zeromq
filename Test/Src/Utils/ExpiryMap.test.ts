/* tslint:disable: no-string-literal */
import anyTest, { ExecutionContext } from "ava";
import type { TestInterface } from "ava";
import * as sinon from "sinon";
import ExpiryMap from "../../../Src/Utils/ExpiryMap";

type TTestContext =
{
    ExpiryBuffer: number;
    ExpiryMap: ExpiryMap<string, string>;
    DummyValues: [string, string][];
    FilledMap: ExpiryMap<string, string>;
};

const test: TestInterface<TTestContext> = anyTest as TestInterface<TTestContext> ;

test.before(async(t: ExecutionContext<TTestContext>): Promise<void> =>
{
    // No setup necessary
});

test.beforeEach((t: ExecutionContext<TTestContext>): void =>
{
    t.context.ExpiryBuffer = 500;
    t.context.ExpiryMap = new ExpiryMap(0);
    t.context.DummyValues = [
        ["0", "myFunc()"],
        ["1", "d"],
        ["2", "200n"],
        ["3", "[ { \"_id\": \"5ef6d0a87fe78748b57ea948\", \"index\": 0, \"guid\": \"4332a763-53e5-4e3d-a978-d22ab6fe976c\", \"isActive\": false, \"balance\": \"$2,443.19\", \"tags\": [ \"pariatur\", \"duis\", \"commodo\", \"velit\", \"eiusmod\", \"minim\", \"eu\" ], \"greeting\": \"Hello, undefined! You have 7 unread messages.\" }, { \"_id\": \"5ef6d0a8e260872db7a55744\", \"index\": 1, \"guid\": \"c1ad2a72-2550-4a85-8556-d591af31041f\", \"isActive\": false, \"balance\": \"$3,257.61\", \"tags\": [ \"eu\", \"laborum\", \"aliquip\", \"tempor\", \"id\", \"ut\", \"consectetur\" ], \"greeting\": \"Hello, undefined! You have 2 unread messages.\" }, { \"_id\": \"5ef6d0a8a64a4201ebe17add\", \"index\": 2, \"guid\": \"ece7aabc-79dc-4286-abc1-25473a2a830e\", \"isActive\": false, \"balance\": \"$3,869.75\", \"tags\": [ \"fugiat\", \"qui\", \"irure\", \"esse\", \"ut\", \"ut\", \"consectetur\" ], \"greeting\": \"Hello, undefined! You have 3 unread messages.\" }, { \"_id\": \"5ef6d0a85fe8e68ca3af8b52\", \"index\": 3, \"guid\": \"0e9fc60a-a75b-4bd6-95f7-bed9fd514a69\", \"isActive\": true, \"balance\": \"$2,195.14\", \"tags\": [ \"aute\", \"ad\", \"irure\", \"et\", \"ea\", \"exercitation\", \"ipsum\" ], \"greeting\": \"Hello, undefined! You have 8 unread messages.\" }, { \"_id\": \"5ef6d0a86c98c87f8447bc85\", \"index\": 4, \"guid\": \"ae607bec-4a42-4884-b801-13fd04712b2e\", \"isActive\": false, \"balance\": \"$1,837.78\", \"tags\": [ \"irure\", \"occaecat\", \"nulla\", \"amet\", \"ut\", \"pariatur\", \"dolor\" ], \"greeting\": \"Hello, undefined! You have 10 unread messages.\" } ]"],
        ["4", "cat"],
    ];
});

test.afterEach((t: ExecutionContext<TTestContext>): void =>
{
    sinon.restore();
});

test("Constructor", (t: ExecutionContext<TTestContext>): void =>
{
    const lNewMap: ExpiryMap<string, string> = new ExpiryMap<string, string>(0);

    t.is(lNewMap["mExpiryMS"], 0);
    t.is(lNewMap["mNextExpiry"], undefined);
    t.is(lNewMap.size, 0);
});

test("Constructor with Entries", (t: ExecutionContext<TTestContext>): void =>
{
    const lDummyEntries: [string, string][] = t.context.DummyValues;
    const lNewMap: ExpiryMap<string, string> = new ExpiryMap<string, string>(0, lDummyEntries);

    t.is(lNewMap["mExpiryMS"], 0);
    t.not(lNewMap["mNextExpiry"], undefined);
    t.is(lNewMap.size, t.context.DummyValues.length);
});

test("Set, Get, and Clear", async(t: ExecutionContext<TTestContext>): Promise<void> =>
{
    const clock: sinon.SinonFakeTimers = sinon.useFakeTimers();
    const lMap: ExpiryMap<string, string> = t.context.ExpiryMap;
    const lDummyValues: [string, string][] = t.context.DummyValues;

    lMap.set(lDummyValues[0][0], lDummyValues[0][1]);
    t.is(lMap.get(lDummyValues[0][0]), lDummyValues[0][1]);

    lMap.set(lDummyValues[1][0], lDummyValues[1][1]);
    lMap.set(lDummyValues[2][0], lDummyValues[2][1]);
    lMap.set(lDummyValues[3][0], lDummyValues[3][1]);
    lMap.set(lDummyValues[4][0], lDummyValues[4][1]);

    t.is(lMap.size, t.context.DummyValues.length);
    t.is(lMap.get(lDummyValues[1][0]), lDummyValues[1][1]);
    t.is(lMap.get(lDummyValues[2][0]), lDummyValues[2][1]);
    t.is(lMap.get(lDummyValues[3][0]), lDummyValues[3][1]);
    t.is(lMap.get(lDummyValues[4][0]), lDummyValues[4][1]);

    clock.tick(t.context.ExpiryBuffer);

    t.is(lMap.size, 0);
});

test("5s Expiry", (t: ExecutionContext<TTestContext>): void =>
{
    const clock: sinon.SinonFakeTimers = sinon.useFakeTimers();
    const lMap: Map<string, string> = new ExpiryMap(5000, t.context.DummyValues);

    clock.tick(5000 + t.context.ExpiryBuffer - 1);
    t.is(lMap.size, t.context.DummyValues.length);

    clock.tick(1);
    t.is(lMap.size, 0);
});

test("Staggered Insertion & Pruning", (t: ExecutionContext<TTestContext>): void =>
{
    const clock: sinon.SinonFakeTimers = sinon.useFakeTimers();
    const lMap: ExpiryMap<bigint, number> = new ExpiryMap<bigint, number>(2000);

    lMap.set(0n, 0);         // 0,1,2 at 0s. Expire 2s, Timer 2.5s
    lMap.set(1n, 1);
    lMap.set(2n, 2);

    clock.tick(1000);   // 3,4,5 at 1s. Expire 3s
    lMap.set(3n, 3);
    lMap.set(4n, 4);
    lMap.set(5n, 5);

    clock.tick(900);    // 6,7,8 at 1.9s. Expire 3.9s
    lMap.set(6n, 6);
    lMap.set(7n, 7);
    lMap.set(8n, 8);

    t.is(lMap.size, 9);

    clock.tick(600);    // 2.5s, timer triggered, first 3 cleared
    t.is(lMap.size, 6);

    clock.tick(1000);   // 3.5s, 2nd timer triggered, next 3 cleared
    t.is(lMap.size, 3);

    clock.tick(900);    // 4.4s 3rd timer triggered, final 3 cleared
    t.is(lMap.size, 0);
});

test("Staggered Insertion, Batched Pruning", (t: ExecutionContext<TTestContext>): void =>
{
    const clock: sinon.SinonFakeTimers = sinon.useFakeTimers();
    const lMap: ExpiryMap<number, boolean> = new ExpiryMap<number, boolean>(2000);

    lMap.set(0, true);
    lMap.set(1, true);

    clock.tick(100);
    lMap.set(2, true);
    lMap.set(3, true);

    clock.tick(200);
    lMap.set(4, true);
    lMap.set(5, true);

    clock.tick(200);
    lMap.set(6, true);
    lMap.set(7, true);

    clock.tick(100);
    lMap.set(8, true);
    lMap.set(9, true);

    t.is(lMap.size, 10);

    clock.tick(1899);
    t.is(lMap.size, 10);
    clock.tick(1);
    t.is(lMap.size, 2);

    clock.tick(599);
    t.is(lMap.size, 2);
    clock.tick(1);
    t.is(lMap.size, 0);
});

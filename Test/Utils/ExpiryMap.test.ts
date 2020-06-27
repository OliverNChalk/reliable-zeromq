import anyTest from "ava";
import type { TestInterface } from "ava";
import * as sinon from "sinon";
import ExpiryMap from "../../Src/Utils/ExpiryMap";

interface TTestContext
{
    ExpiryBuffer: number,
    ExpiryMap: ExpiryMap<string, string>,
    DummyValues: [string, string][],
    FilledMap: ExpiryMap<string, string>,
}
const test = anyTest as TestInterface<TTestContext> ;


test.before(async(t: any) =>
{
    // Async setup before all tests
});

test.beforeEach((t: any) =>
{
    // Temporary setup before each test runs
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

test.afterEach((t: any) =>
{
    sinon.restore();
});

test("Constructor", (t) =>
{
    const lNewMap: ExpiryMap<string, string> = new ExpiryMap<string, string>(0);

    t.is(lNewMap["mExpiryMS"], 0);
    t.is(lNewMap["mNextExpiry"], undefined);
    t.is(lNewMap.size, 0);
});

test("Constructor with Entries", (t) =>
{
    const lDummyEntries = t.context.DummyValues;
    const lNewMap: ExpiryMap<string, string> = new ExpiryMap<string, string>(0, lDummyEntries);

    t.is(lNewMap["mExpiryMS"], 0);
    t.not(lNewMap["mNextExpiry"], undefined);
    t.is(lNewMap.size, t.context.DummyValues.length);
});

test("Set, Get, and Clear", async(t) =>
{
    const clock = sinon.useFakeTimers();
    const lMap = t.context.ExpiryMap;
    const lDummyValues = t.context.DummyValues;

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

test("5s Expiry", (t) =>
{
    const clock = sinon.useFakeTimers();
    const lMap = new ExpiryMap(5000, t.context.DummyValues);

    clock.tick(5000 + t.context.ExpiryBuffer - 1);
    t.is(lMap.size, t.context.DummyValues.length);

    clock.tick(1);
    t.is(lMap.size, 0);
});

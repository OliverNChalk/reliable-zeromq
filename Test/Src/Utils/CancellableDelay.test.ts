/* tslint:disable: no-string-literal */
import anyTest, { ExecutionContext } from "ava";
import type { TestInterface } from "ava";
import * as sinon from "sinon";
import { CancellableDelay } from "../../../Src/Utils/Delay";
import { YieldToEventLoop } from "../../Helpers/AsyncTools";

type TTestContext =
{};

const test: TestInterface<TTestContext> = anyTest as TestInterface<TTestContext> ;

test.before(async(t: ExecutionContext<TTestContext>): Promise<void> =>
{
    // No setup necessary
});

test.beforeEach((t: ExecutionContext<TTestContext>): void =>
{
    // No setup necessary
});

test.afterEach((t: ExecutionContext<TTestContext>): void =>
{
    sinon.restore();
});

test("Constructor & Create", async(t: ExecutionContext<TTestContext>): Promise<void> =>
{
    const clock: sinon.SinonFakeTimers = sinon.useFakeTimers();
    const lCancellableDelay: CancellableDelay = new CancellableDelay();

    let lCalled: boolean = false;
    lCancellableDelay.Create(500).then((): void => { lCalled = true; });

    clock.tick(500);
    await YieldToEventLoop();    // Yield test method to event loop

    t.is(lCalled, true);

    lCalled = false;
    lCancellableDelay.Create().then((): void => { lCalled = true; });

    clock.tick(100);
    await YieldToEventLoop();    // Yield test method to event loop

    t.is(lCalled, true);

    // Cancel before expiry
    lCalled = false;
    lCancellableDelay.Create(50).then((): void => { lCalled = true; });
    t.is(lCalled, false);

    lCancellableDelay.Clear();
    clock.tick(50);

    await YieldToEventLoop();

    t.is(lCalled, false);

    // Cancel after expiry
    const lPromise: Promise<void> = lCancellableDelay.Create(50).then((): void => { lCalled = true; });
    t.is(lCalled, false);

    clock.tick(50);
    lCancellableDelay.Clear();

    await YieldToEventLoop();

    t.is(lCalled, true);
    t.is(await lPromise, undefined);
});

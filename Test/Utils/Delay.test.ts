/* tslint:disable: no-string-literal */
import anyTest, { ExecutionContext } from "ava";
import type { TestInterface } from "ava";
import * as sinon from "sinon";
import { Delay } from "../../Src/Utils/Delay";

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

test("Constructor", async(t: ExecutionContext<TTestContext>): Promise<void> =>
{
    const clock: sinon.SinonFakeTimers = sinon.useFakeTimers();

    let lCalled: boolean = false;
    Delay(500).then((): void => { lCalled = true; });

    clock.tick(500);
    await Promise.resolve();    // Yield test method to event loop

    t.is(lCalled, true);

    lCalled = false;
    Delay().then((): void => { lCalled = true; });

    clock.tick(100);
    await Promise.resolve();    // Yield test method to event loop

    t.is(lCalled, true);
});

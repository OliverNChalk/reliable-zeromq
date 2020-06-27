import anyTest from "ava";
import type { TestInterface } from "ava";
import * as sinon from "sinon";

interface TTestContext
{
    dummy: string,
}
const test = anyTest as TestInterface<TTestContext> ;


test.before(async(t: any) =>
{
    // Async setup before all tests
});

test.beforeEach((t: any) =>
{
    // Temporary setup before each test runs
});
test.afterEach((t: any) => sinon.restore());

test.todo("Synchronous Set & Get");
test.todo("Asynchronous Set & Get");
test.todo("0s Expiry");
test.todo("5s Expiry");

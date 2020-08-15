/* tslint:disable: no-string-literal */
import type { ExecutionContext } from "ava";
import test from "ava";
import Config from "../Src/Config";

test("Full Test", (t: ExecutionContext<any>) =>
{
    // Check defaults
    t.is(Config.MaximumLatency, 5000);
    t.is(Config.HeartBeatInterval, 1000);

    Config.SetGlobalConfig(2000);
    t.is(Config.MaximumLatency, 2000);
    t.is(Config.HeartBeatInterval, 1000);

    Config.SetGlobalConfig(4000, 1500);
    t.is(Config.MaximumLatency, 4000);
    t.is(Config.HeartBeatInterval, 1500);

    t.throws(() =>
    {
        Config.SetGlobalConfig(500, 1000);
    });
});

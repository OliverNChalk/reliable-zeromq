const logRunning: any = require("why-is-node-running");
import { Delay } from "../../Src/Utils/Delay";
import { ZMQRequest } from "../../Src/ZMQRequest";
import { ZMQResponse } from "../../Src/ZMQResponse";

async function Test()
{
    // Config.SetGlobalConfig(45, 20);
    const lRouter = new ZMQResponse("tcp://127.0.0.1:3452", () => Promise.resolve("DEFAULT RESPONSE"));
    const lDealer = new ZMQRequest("tcp://127.0.0.1:3452");

    console.log(await lDealer.Send("HELLO"));

    lRouter.Close();
    lDealer.Close();

    // for (let i: number = 0; i < 25; ++i)
    // {
    //     process.stdout.write("||\n||\n||\n" + `===== ITERATION ${i} =====` + "||\n||\n||\n");
    //     logRunning();
    //     await Delay(50);
    // }
}

// setTimeout(() => { logRunning(); }, 2500);

// async function LogRunning(): Promise<void>
// {
//     for (let i: number = 0; i < 10; ++i)
//     {
//         process.stdout.write("||\n||\n||\n" + `===== ITERATION ${i} =====` + "||\n||\n||\n");
//         logRunning();
//         await Delay(50);
//     }
// }
//
// LogRunning();
Test();

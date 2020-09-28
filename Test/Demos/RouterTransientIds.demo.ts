/* tslint:disable no-console */
import uniqid from "uniqid";
import * as zmq from "zeromq";
import { Delay } from "../../Src/Utils/Delay";
import TestEndpoint from "../Helpers/TestEndpoint";

// Config
const NUM_DEALERS: number = 40;
const ROUTER_ADDRESS: string = TestEndpoint.GetEndpoint("TransientTest");
const MAX_DELAY_SECONDS: number = 1200; // 20 minutes
const NUMBER_OF_RESPONSES: number = 7;

const lRouter: zmq.Router = new zmq.Router;
let lClosedCount: number = 0;

function DealerClosed(): void
{
    if (++lClosedCount === NUM_DEALERS)
    {
        console.log("TEST DONE, CLOSING ROUTER");
        lRouter.close();
    }
}

async function IterateTest(aDealer: zmq.Dealer): Promise<void>
{
    const lRandomMessage: string = uniqid.time();
    await aDealer.send(lRandomMessage);

    const lExpectedResponses: string[] = [];
    for (let i: number = 0; i < NUMBER_OF_RESPONSES; ++i)
    {
        lExpectedResponses.push(`${lRandomMessage}_${i}_ACK`);
    }

    const lReceivedResponses: string[] = [];
    for (let i: number = 0; i < NUMBER_OF_RESPONSES; ++i)
    {
        const lResponse: string = (await aDealer.receive()).toString();
        lReceivedResponses.push(lResponse);
    }

    const lDifference: string[] = lReceivedResponses
        .filter((aReceived: string) => !lExpectedResponses.includes(aReceived))
        .concat(lExpectedResponses.filter((aExpected: string) => !lReceivedResponses.includes(aExpected)));

    console.log(lDifference);
    if (lDifference.length > 0)
    {
        console.log("lExpectedResponses");
        console.log(lExpectedResponses);
        console.log("lReceivedResponses");
        console.log(lReceivedResponses);
    }

    aDealer.close();
    DealerClosed();
}

async function HandleRequests(aRouter: zmq.Router): Promise<void>
{
    for await (const [sender, msg] of aRouter)
    {
        HandleRequest(aRouter, sender, msg.toString());
    }
}

async function HandleRequest(aRouter: zmq.Router, aSender: Buffer, aMessage: string): Promise<void>
{
    for (let i: number = 0; i < NUMBER_OF_RESPONSES; ++i)
    {
        const lRandomNumber: number = Math.random() * 0.9 + 0.1;
        const lRandomExponential: number = -Math.log10(lRandomNumber);
        const lRandomDelay: number = MAX_DELAY_SECONDS * 1000 * lRandomExponential; // 0-10 seconds

        await Delay(lRandomDelay);

        aRouter.send([aSender, `${aMessage}_${i}_ACK`]);
    }
}

async function RunDemo(): Promise<void>
{
    const lDealers: zmq.Dealer[] = [];

    // Socket setup:
    await lRouter.bind(ROUTER_ADDRESS);

    for (let i: number = 0; i < NUM_DEALERS; ++i)
    {
        const lNewDealer: zmq.Dealer = new zmq.Dealer;
        lNewDealer.connect(ROUTER_ADDRESS);

        lDealers.push(lNewDealer);
    }

    // Setup Router Responder
    HandleRequests(lRouter);

    await Delay(500);

    for (let i: number = 0; i < NUM_DEALERS; ++i)
    {
        IterateTest(lDealers[i]);
    }
}

RunDemo();

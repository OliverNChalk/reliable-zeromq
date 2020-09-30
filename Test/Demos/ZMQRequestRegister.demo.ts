import { ZMQRequest } from "../../Src/ZMQRequest";
import { ZMQResponse } from "../../Src/ZMQResponse";
import TestEndpoint from "../Helpers/TestEndpoint";

async function RunDemo(): Promise<void>
{
    const lEndpoint: string = TestEndpoint.GetEndpoint("RegistrationDemo");
    const lResponder: ZMQResponse = new ZMQResponse(lEndpoint, (): Promise<string> => Promise.resolve("RESPONSE"));
    const lRequester: ZMQRequest = new ZMQRequest(lEndpoint, { CacheError: undefined! });

    await lRequester.Send("HELLO, THIS IS MESSAGE 1");

    lResponder.Close();
    lRequester.Close();
}

RunDemo();

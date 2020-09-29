import { ZMQRequest } from "../../Src/ZMQRequest";
import { ZMQResponse } from "../../Src/ZMQResponse";
import TestEndpoint from "../Helpers/TestEndpoint";

async function RunDemo(): Promise<void>
{
    const lEndpoint: string = TestEndpoint.GetEndpoint("RegistrationDemo");
    const lResponder: ZMQResponse = new ZMQResponse(lEndpoint, (): Promise<string> => Promise.resolve("RESPONSE"));
    const lRequester: ZMQRequest = new ZMQRequest(lEndpoint);

    await lRequester.Open();

    lResponder.Close();
    lRequester.Close();
}

RunDemo();

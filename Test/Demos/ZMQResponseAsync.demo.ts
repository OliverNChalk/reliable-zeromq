// import { Delay } from "../../Src/Utils/Delay";
// import { TRequestResponse, ZMQRequest } from "../../Src/ZMQRequest";
// import { ZMQResponseAsync } from "../../Src/ZMQResponseAsync";
// import TestEndpoint from "../Helpers/TestEndpoint";
//
// async function RunDemo(): Promise<void>
// {
//     const lEndpoint: string = TestEndpoint.GetEndpoint("ZMQResponseAsyncDemo");
//     const lResponder: ZMQResponseAsync = new ZMQResponseAsync(
//         lEndpoint,
//         (): Promise<string> =>
//         {
//             return Delay(2000)
//                 .then(() => "RESPONSE!");
//         },
//     );
//     const lRequester: ZMQRequest = new ZMQRequest(lEndpoint);
//
//     const lResult: TRequestResponse = await lRequester.Send("MY TEST REQUEST");
//
//     console.log(lResult);
//     lResponder.Close();
//     lRequester.Close();
// }
//
// RunDemo();

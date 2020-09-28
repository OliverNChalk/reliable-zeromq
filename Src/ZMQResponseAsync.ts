// import { ZMQResponse } from "./ZMQResponse";
//
// export class ZMQResponseAsync extends ZMQResponse
// {
//     public constructor(aReplierEndpoint: string, aReceiver: (aRequest: string) => Promise<string>)
//     {
//         super(aReplierEndpoint, aReceiver);
//     }
//
//     private AcknowledgeRequest(aNonce: Buffer, aSender: Buffer): Promise<void>
//     {
//         return this.mRouter.send([aSender, aNonce]);
//     }
//
//     private ProcessAck(aSenderUID: Buffer, aNonce: Buffer): void
//     {
//         const lMessageId: string = aSenderUID.toString() + aNonce.toString();
//         // this.mCachedRequests.
//     }
//
//     protected async ProcessMessage(aSenderUID: Buffer, aNonce: Buffer, aMsg: Buffer, aSender: Buffer): Promise<void>
//     {
//         // TODO: Consider converting Buffers to strings here to prevent repeated conversion
//         if (this.IsResponseAck(aSenderUID, aNonce, aMsg))
//         {
//             this.ProcessAck(aSenderUID, aNonce);
//         }
//         else
//         {
//             await this.AcknowledgeRequest(aNonce, aSender);
//             this.ProcessNewRequest(aSenderUID, aNonce, aMsg, aSender);
//         }
//     }
// }

import * as zmq from "zeromq";
import Config from "./Config";
import { TCacheError } from "./Errors";
import ExpiryMap from "./Utils/ExpiryMap";
import { GenerateMessage } from "./Utils/GenerateMessage";

export type TZMQResponseErrorHandlers =
{
    CacheError: (aError: TCacheError) => void;
};

type TRequesterEntry =
{
    LatestNonce: number;
    Cache: ExpiryMap<string, string | Promise<string>>;
};

export class ZMQResponse
{
    private readonly mEndpoint: string;
    private readonly mErrorHandlers: TZMQResponseErrorHandlers;
    private readonly mRequestHandler: (aRequest: string) => Promise<string>;
    private mRouter!: zmq.Router;

    public constructor(
        aReplierEndpoint: string,
        aReceiver: (aRequest: string) => Promise<string>,
        aErrorHandlers: TZMQResponseErrorHandlers,
    )
    {
        this.mEndpoint = aReplierEndpoint;
        this.mErrorHandlers = aErrorHandlers;
        this.mRequestHandler = aReceiver;

        this.Open();
    }

    public get Endpoint(): string
    {
        return this.mEndpoint;
    }
    private readonly mRequesters: Map<string, TRequesterEntry> = new Map();

    private GenerateResponsePromise(aMsg: string, aRequester: TRequesterEntry, aNonce: string): Promise<string>
    {
        const lPromise: Promise<string> = this.mRequestHandler(aMsg.toString());
        aRequester.Cache.set(aNonce, lPromise); // TODO: Timer starts from when promise is inserted, this will cause issues if we move to an req, ack, rep model

        lPromise.then((aResponse: string): void =>  // TODO: Review performance if we use a non-blocking await lPromise, we can await non-promise results which we cant .then
        {
            aRequester!.Cache.set(aNonce, aResponse);
        });

        return lPromise;
    }

    private IsRegistrationMessage(aNonce: Buffer): boolean
    {
        return Number(aNonce) === -1;
    }

    private IsResponseAck(aSenderUID: Buffer, aNonce: Buffer, aMsg: Buffer): boolean
    {
        const lResponseAck: string = GenerateMessage.Ack(aSenderUID.toString(), aNonce);

        return aMsg.toString() === lResponseAck;
    }

    private Open(): void
    {
        this.mRouter = new zmq.Router();
        this.mRouter.bind(this.mEndpoint)
            .then(() =>
            {
                this.ReceiveLoop();
            });
    }

    private async ProcessMessage(aSenderUID: Buffer, aNonce: Buffer, aMsg: Buffer, aSender: Buffer): Promise<void>
    {
        if (this.IsResponseAck(aSenderUID, aNonce, aMsg))
        {}
        else if (this.IsRegistrationMessage(aNonce))
        {
            this.ProcessNewRegistration(aSenderUID.toString());
        }
        else
        {
            this.ProcessNewRequest(aSenderUID, aNonce, aMsg, aSender);
        }
    }

    private ProcessNewRegistration(aSenderUID: string): void
    {
        let lRequester: TRequesterEntry | undefined = this.mRequesters.get(aSenderUID);
        if (!lRequester)
        {
            lRequester =
            {
                Cache: new ExpiryMap<string, string | Promise<string>>(3 * Config.MaximumLatency),
                LatestNonce: 0,
            };
            this.mRequesters.set(aSenderUID, lRequester);
        }
        else
        {
            throw new Error("RECEIVED A REGISTRATION ATTEMPT FOR AN ALREADY REGISTERED REQUESTER");
        }
    }

    private ProcessNewRequest(aSenderUID: Buffer, aNonce: Buffer, aMsg: Buffer, aSender: Buffer): void
    {
        // Forward requests to the registered handler
        const lRequesterUID: string = aSenderUID.toString();
        const lNonce: string = aSenderUID.toString() + aNonce.toString();
        const lMessage: string = aMsg.toString();

        const lRequester: TRequesterEntry = this.mRequesters.get(lRequesterUID)!;   // All requesters must first register, if not ZMQResponse will crash
        const lResponse: string | Promise<string> | undefined = lRequester.Cache.get(lNonce);

        let lPromise: Promise<string>;
        if (!lResponse)
        {
            lPromise = this.GenerateResponsePromise(lMessage, lRequester, lNonce);
        }
        else
        {
            lPromise = Promise.resolve(lResponse);
        }

        lPromise.then((aResponse: string): void =>
        {
            this.mRouter.send([aSender, aNonce, aResponse]);    // TODO: Check if it's possible for two sequential calls to mRouter.send to trigger a crash
        });
    }

    private async ReceiveLoop(): Promise<void>
    {
        for await (const [sender, sender_uid, nonce, msg] of this.mRouter)
        {
            this.ProcessMessage(sender_uid, nonce, msg, sender);
        }
    }

    public Close(): void
    {
        this.mRequesters.clear();

        this.mRouter.linger = 0;
        this.mRouter.close();
        this.mRouter = undefined!;
    }
}

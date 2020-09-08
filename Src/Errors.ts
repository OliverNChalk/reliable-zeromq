import { TSubscriptionEndpoints } from "./ZMQSubscriber";

export type TCacheError =
{
    Endpoint: TSubscriptionEndpoints;
    Topic: string;
    MessageId: number;
};

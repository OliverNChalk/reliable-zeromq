import { TSubscriptionEndpoints } from "./ZMQSubscriber/ZMQSubscriber";

export type TCacheError =
{
    Endpoint: TSubscriptionEndpoints;
    Topic: string;
    MessageId: number;
};

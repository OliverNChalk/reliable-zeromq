import { TSubscriptionEndpoints } from "./ZMQSubscriber/ZMQSubscriber";

export type TPublisherCacheError =
{
    Endpoint: TSubscriptionEndpoints;
    Topic: string;
    MessageNonce: number;
};

export type TResponseCacheError =
{
    Endpoint: string;
    MessageNonce: number;
};

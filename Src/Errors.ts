import { TSubscriptionEndpoints } from "./ZMQSubscriber/ZMQSubscriber";

// ZMQPublisher Errors
export type TPublisherHwmWarning =
{
    Topic: string;
    Nonce: number;
    Message: string;
};

export type TZMQPublisherErrorHandlers =
{
    HighWaterMarkWarning: (aWarning: TPublisherHwmWarning) => void;
};

export const DEFAULT_ZMQ_PUBLISHER_ERROR_HANDLERS: TZMQPublisherErrorHandlers =
{
    HighWaterMarkWarning: (): void => {},
};

// ZMQSubscriber Errors
export type TPublisherCacheError =
{
    Endpoint: TSubscriptionEndpoints;
    Topic: string;
    MessageNonce: number;
};

export type TDroppedMessageWarning =
{
    Topic: string;
    Nonces: number[];
};

export type TZMQSubscriberErrorHandlers =
{
    CacheError: (aError: TPublisherCacheError) => void;
    DroppedMessageWarn: (aWarning: TDroppedMessageWarning) => void;
};

export const DEFAULT_ZMQ_SUBSCRIBER_ERROR_HANDLERS: TZMQSubscriberErrorHandlers =
{
    CacheError: (aError: TPublisherCacheError): void => { throw aError; },
    DroppedMessageWarn: (aWarning: TDroppedMessageWarning): void => {},
};

// ZMQRequest Errors
export type TResponseCacheError =
{
    Endpoint: string;
    MessageNonce: number;
};

export type TRequestHwmWarning =
{
    Requester: string;
    Nonce: number;
    Message: string;
};

export type TZMQRequestErrorHandlers =
{
    CacheError: (aError: TResponseCacheError) => void;
    HighWaterMarkWarning: (aWarning: TRequestHwmWarning) => void;
};

export const DEFAULT_ZMQ_REQUEST_ERROR_HANDLERS: TZMQRequestErrorHandlers =
{
    CacheError: (aError: TResponseCacheError): void => { throw aError; },
    HighWaterMarkWarning: (aWarning: TRequestHwmWarning): void => {},
};

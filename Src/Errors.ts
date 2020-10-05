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

export type TRequestHwmWarning =
{
    Requester: string;
    Nonce: number;
    Message: string;
};

export type TZMQRequestErrorHandlers =
{
    HighWaterMarkWarning: (aWarning: TRequestHwmWarning) => void;
};

export const DEFAULT_ZMQ_REQUEST_ERROR_HANDLERS: TZMQRequestErrorHandlers =
{
    HighWaterMarkWarning: (aWarning: TRequestHwmWarning): void => {},
};

// ZMQResponse Errors
export type TResponseHwmWarning =
{
    Requester: string;
    Nonce: number;
    Message: string;
};

export type TZMQResponseErrorHandlers =
{
    HighWaterMarkWarning: (aWarning: TResponseHwmWarning) => void;
};

export const DEFAULT_ZMQ_RESPONSE_ERROR_HANDLERS: TZMQResponseErrorHandlers =
{
    HighWaterMarkWarning: (aWarning: TResponseHwmWarning): void => {},
};

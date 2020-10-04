import { THighWaterMarkWarning } from "./ZMQPublisher";
import { TSubscriptionEndpoints } from "./ZMQSubscriber/ZMQSubscriber";

// ZMQPublisher Errors
export type TZMQPublisherErrorHandlers =
{
    HighWaterMarkWarning: (aWarning: THighWaterMarkWarning) => void;
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
    CacheError: (aError: TPublisherCacheError): void => { throw aError; },  // Throw unhandled warning
    DroppedMessageWarn: (aWarning: TDroppedMessageWarning): void => {},     // Suppress warns
};

// ZMQRequest Errors
export type TResponseCacheError =
{
    Endpoint: string;
    MessageNonce: number;
};

export type TZMQRequestErrorHandlers =
{
    CacheError: (aError: TResponseCacheError) => void;
};

export const DEFAULT_ZMQ_REQUEST_ERROR_HANDLERS: TZMQRequestErrorHandlers =
{
    CacheError: (aError: TResponseCacheError): void => { throw aError; },
};

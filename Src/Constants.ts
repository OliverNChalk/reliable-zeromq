import { TEndpointAddressList } from "./Interfaces";

// Type-safety flows from EEndpoints, so edit this to add more endpoints
export enum EEndpoint
{
    STATUS_UPDATES = "STATUS_UPDATES",
}

export const DUMMY_ENDPOINTS: TEndpointAddressList =
{
      STATUS_UPDATES: {
          PublisherAddress: "tcp://127.0.0.1:3000",
          RequestAddress: "tcp://127.0.0.1:3001",
          ServiceAddress: "tcp://127.0.0.1:3002",
      },
};

export const MAXIMUM_LATENCY: number = 5000;
export const HEARTBEAT_INTERVAL: number = 1000; // Must be less than MAXIMUM_LATENCY, ideally 3x+ smaller
export const PUBLISHER_CACHE_EXPIRY_MS: number = 3 * MAXIMUM_LATENCY;   // HEARTBEAT_TIME + PUBLISH_TIME + REQUEST_TIME

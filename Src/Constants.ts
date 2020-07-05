import { TEndpointAddressList } from "./Interfaces";

// Type-safety flows from EEndpoints, so edit this to add more endpoints
export enum EEndpoint
{
    STATUS_UPDATES = "STATUS_UPDATES",
    WEATHER_UPDATES = "WEATHER_UPDATES",
}

export const DUMMY_ENDPOINTS: TEndpointAddressList =
{
      STATUS_UPDATES: {
          PublisherAddress: "tcp://127.0.0.1:3242",
          RequestAddress: "tcp://127.0.0.1:3243",
          ServiceAddress: "tcp://127.0.0.1:3244",
      },
      WEATHER_UPDATES: {
          PublisherAddress: "tcp://127.0.0.1:3342",
          RequestAddress: "tcp://127.0.0.1:3343",
          ServiceAddress: "tcp://127.0.0.1:3344",
      },
};

export const MAXIMUM_LATENCY: number = 5000;
export const HEARTBEAT_INTERVAL: number = 1000; // Must be less than MAXIMUM_LATENCY, ideally 3x+ smaller
export const PUBLISHER_CACHE_EXPIRY_MS: number = 3 * MAXIMUM_LATENCY;   // HEARTBEAT_TIME + PUBLISH_TIME + REQUEST_TIME

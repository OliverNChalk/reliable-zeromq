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

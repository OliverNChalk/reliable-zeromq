import { EEndpoint } from "./Constants";

export type TEndpointAddressList = { [K in keyof typeof EEndpoint]: TEndpointAddresses };

export type TEndpointAddresses =
{
    PublisherAddress: string;
    RequestAddress: string;
    ServiceAddress: string;
};

export interface IMessage
{
      topic: string;
      data: any;
}

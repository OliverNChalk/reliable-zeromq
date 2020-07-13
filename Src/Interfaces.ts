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

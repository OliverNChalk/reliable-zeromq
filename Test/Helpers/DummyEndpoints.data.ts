import TestEndpoint from "./TestEndpoint";

// tslint:disable-next-line:typedef
export const DUMMY_ENDPOINTS =
{
      STATUS_UPDATES: {
          PublisherAddress: TestEndpoint.GetEndpoint("status_updates_publisher"),
          RequestAddress: TestEndpoint.GetEndpoint("status_updates_request"),
      },
      WEATHER_UPDATES: {
          PublisherAddress: "tcp://127.0.0.1:3245",
          RequestAddress: "tcp://127.0.0.1:3246",
      },
};

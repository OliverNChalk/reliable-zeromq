// tslint:disable-next-line:typedef
export const DUMMY_ENDPOINTS =
{
      STATUS_UPDATES: {
          PublisherAddress: "ipc:///tmp/zeromq/status_updates/publisher.ipc",
          RequestAddress: "ipc:///tmp/zeromq/status_updates/request.ipc",
      },
      WEATHER_UPDATES: {
          PublisherAddress: "tcp://127.0.0.1:3245",
          RequestAddress: "tcp://127.0.0.1:3246",
      },
};

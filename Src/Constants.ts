// tslint:disable-next-line:typedef
export const DUMMY_ENDPOINTS =
{
      STATUS_UPDATES: {
          PublisherAddress: "tcp://127.0.0.1:3242",
          RequestAddress: "tcp://127.0.0.1:3243",
      },
      WEATHER_UPDATES: {
          PublisherAddress: "tcp://127.0.0.1:3245",
          RequestAddress: "tcp://127.0.0.1:3246",
      },
};

export const MAXIMUM_LATENCY: number = 5000;
export const HEARTBEAT_INTERVAL: number = 1000; // Must be less than MAXIMUM_LATENCY, ideally 3x+ smaller
export const PUBLISHER_CACHE_EXPIRY_MS: number = 3 * MAXIMUM_LATENCY;   // HEARTBEAT_TIME + PUBLISH_TIME + REQUEST_TIME

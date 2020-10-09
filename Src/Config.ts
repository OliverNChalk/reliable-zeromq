export default class Config
{
    // Consider making parameters immutable once first used, to avoid issues like different cache expiries
    private static mMaximumLatency: number = 2000;
    private static mHeartbeatInterval: number = 100;

    public static get MaximumLatency(): number
    {
        return this.mMaximumLatency;
    }

    public static get HeartBeatInterval(): number
    {
        return this.mHeartbeatInterval;
    }

    public static set MaximumLatency(aMaximumLatency: number)
    {
        if (aMaximumLatency < this.mHeartbeatInterval)
        {
            throw new Error("Heartbeat must be lower than maximum latency");
        }

        this.mMaximumLatency = aMaximumLatency;
    }

    public static set HeartBeatInterval(aHeartbeatInterval: number)
    {
        if (aHeartbeatInterval > this.mMaximumLatency)
        {
            throw new Error("Heartbeat must be lower than maximum latency");
        }

        this.mHeartbeatInterval = aHeartbeatInterval;
    }

    public static SetGlobalConfig(aMaximumLatency: number = 2000, aHeartbeat: number = 1000): void
    {
        if (aMaximumLatency < aHeartbeat)
        {
            throw new Error("Heartbeat must be lower than maximum latency");
        }

        this.mMaximumLatency = aMaximumLatency;
        this.mHeartbeatInterval = aHeartbeat;
    }
}

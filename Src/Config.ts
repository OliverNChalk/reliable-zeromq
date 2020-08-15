export default class Config
{
    // Consider making parameters immutable once first used, to avoid issues like different cache expiries
    private static mMaximumLatency: number = 5000;
    private static mHeartbeatInterval: number = 1000;

    public static get MaximumLatency(): number
    {
        return this.mMaximumLatency;
    }

    public static get HeartBeatInterval(): number
    {
        return this.mHeartbeatInterval;
    }

    public static SetGlobalConfig(aMaximumLatency: number, aHeartbeat: number = 1000): void
    {
        if (aMaximumLatency < aHeartbeat)
        {
            throw new Error("Heartbeat must be lower than maximum latency");
        }

        this.mMaximumLatency = aMaximumLatency;
        this.mHeartbeatInterval = aHeartbeat;
    }
}

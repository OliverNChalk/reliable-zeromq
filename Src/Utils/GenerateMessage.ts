export class GenerateMessage
{
    private constructor()
    {}

    public static Ack(aUniqueId: string, aNonce: Buffer): string
    {
        return `${aUniqueId}_${aNonce.toString()}_ACK`;
    }
}

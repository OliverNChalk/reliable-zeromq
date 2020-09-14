import * as Path from "path";

export default class Endpoint
{
    public static GetEndpoint(aName: string): string
    {
        return "ipc://" + Path.normalize(`${__dirname}../../../../Endpoints/${aName}.ipc`);
    }
}

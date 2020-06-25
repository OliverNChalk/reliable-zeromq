export default class JSONBigInt
{
    private static ParseReviver(aKey: any, aValue: any): any
    {
        // Only consider strings that are all digits and end in letter "n" e.g. 10675364n
        // considers negative values as well

        if (typeof aValue === "string")
        {
            const lLength: number = aValue.length;

            if (lLength > 1 && aValue[lLength - 1] === "n")
            {
                let lAllDigits: boolean = true;
                for (let i: number = 0; i < lLength - 1 && lAllDigits; i++)
                {
                    const lValue: string = aValue[i];
                    lAllDigits = lAllDigits && ((lValue >= "0" && lValue <= "9") || ((i === 0) && lValue === "-"));
                }

                if (lAllDigits)
                {
                    return BigInt(aValue.slice(0, -1));
                }
            }
        }
        return aValue;
    }

    private static StringifyReplacer(aKey: any, aValue: any): string
    {
        if (typeof aValue === "bigint")
        {
            return aValue.toString() + "n";
        }
        else
        {
            return aValue;
        }
    }

    public static Parse(aString: string): any
    {
        return JSON.parse(aString, JSONBigInt.ParseReviver);
    }

    public static Stringify(aValue: any): string
    {
        return JSON.stringify(aValue, JSONBigInt.StringifyReplacer);
    }
}

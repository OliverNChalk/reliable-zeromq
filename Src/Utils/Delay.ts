
export const Delay = (aMS: number = 100): Promise<void> =>
{
    return new Promise((aResolve: any): void =>
    {
       setTimeout(aResolve, aMS);
    });
};

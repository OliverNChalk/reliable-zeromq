/* tslint:disable no-console */
import { CancellableDelay } from "../../Src/Utils/Delay";

console.log("START CODE:" + Date.now());
const lCancellableDelayFactory: CancellableDelay = new CancellableDelay();
const lCancellableDelay: Promise<void> = lCancellableDelayFactory.Create(2500);
lCancellableDelay.then(() => console.log("PROMISE RESOLVE:" + Date.now()));
lCancellableDelayFactory.Clear();
console.log("END CODE:" + Date.now());

process.on("exit", () => console.log("PROCESS EXIT:" + Date.now()));

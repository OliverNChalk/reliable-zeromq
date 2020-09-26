/* tslint:disable no-console */

import { CancellableDelay, ICancellableDelay } from "../../Src/Utils/Delay";

console.log("START CODE:" + Date.now());
const lCancellableDelay: ICancellableDelay = CancellableDelay(2500);
lCancellableDelay.then(() => console.log("PROMISE RESOLVE:" + Date.now()));
lCancellableDelay.Resolve();
console.log("END CODE:" + Date.now());

process.on("exit", () => console.log("PROCESS EXIT:" + Date.now()));

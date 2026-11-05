// Imports a Node-loaded library that, while this module evaluates, requires loop-y, which
// the bridge evaluates and which imports this module back.
import { requireLoopY } from "@m/feature";
export const x = "x";
export const seenThroughY = requireLoopY().fromX;

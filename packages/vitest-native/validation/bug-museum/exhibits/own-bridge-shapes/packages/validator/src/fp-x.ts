// Imports the library that requires it, and waits on a top-level await meanwhile.
import { requireFpX } from "@m/feature";
import { w } from "./fp-wait";
export const ready = "ready" + w + typeof requireFpX;

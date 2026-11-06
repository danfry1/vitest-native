// An installed ES module that imports the target package by name (Node's ESM loader).
import target, { source } from "dispatch-target-lib";
import * as namespace from "dispatch-target-lib";

export const seen = source;
export const defaultSeen = target;
export const fnSeen = namespace.fn;

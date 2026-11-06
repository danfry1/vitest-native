// A second installed ES module that imports the target package, for a fresh import after a re-mock.
import target, { source } from "dispatch-target-lib";

export const seen = source;
export const defaultSeen = target;

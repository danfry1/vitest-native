// An installed ES module that imports the target package by name (Node's ESM loader).
import { source } from "dispatch-target-lib";

export const seen = source;

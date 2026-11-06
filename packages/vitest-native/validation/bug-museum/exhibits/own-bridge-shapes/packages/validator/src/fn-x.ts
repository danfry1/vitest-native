// Imports the library that requires fn-y while this module evaluates.
import { requireFnY } from "@m/feature";
export const x = "x";
export const seen = requireFnY().seen;

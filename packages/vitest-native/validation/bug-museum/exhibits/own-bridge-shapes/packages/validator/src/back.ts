// Imports a Node-loaded library that requires this module back while it evaluates: Node
// gets its exports as they are so far, as in Node and Jest.
import { requireBack } from "@m/feature";
export const first = "first";
export const seenFromNode = requireBack().first;

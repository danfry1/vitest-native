// An ES index the engine compiles to CommonJS (an .mjs file in a React Native package),
// whose compiled require()s reach these CommonJS siblings.
import fn from "./fn.js";
export { Root, made } from "./parts.js";
export const fnKind = typeof fn;

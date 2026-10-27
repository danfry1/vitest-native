// A module the engine compiles to CommonJS that imports an `.mjs` file: compiled, the
// import is a require() of it.
import { os, tree } from "./rn-platform.mjs";

export const viaMjs = { os, tree };

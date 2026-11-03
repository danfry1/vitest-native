// Entry: requires a.js, which requires m.js, which imports a.js back (the cycle).
export { viaM } from "./cjs/a.js";

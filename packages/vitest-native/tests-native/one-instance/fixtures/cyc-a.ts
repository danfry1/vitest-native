export const state = { from: "cyc-a" };
const b = require("./cyc-b.cjs") as { a: { state?: unknown } };
export const bSaw = () => b.a;

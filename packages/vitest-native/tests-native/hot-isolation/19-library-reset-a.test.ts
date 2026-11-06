import { it } from "vitest";
import { runReanimatedFromAResetRegistry } from "./library-reset.js";

// Order-independent twin of the other library-reset file: whichever runs second
// asserts that the library registry was reset between the two.
it("runs Reanimated from a library registry reset since the previous file", () => {
  runReanimatedFromAResetRegistry();
});

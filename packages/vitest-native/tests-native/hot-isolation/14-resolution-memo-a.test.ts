import { it } from "vitest";
import { loadAgainAfterThePreviousFile } from "./resolution-memo.js";

// Order-independent twin of the other resolution-memo file: whichever runs second
// asserts that a library the first one loaded is not resolved, or read, again.
it("re-loads a library without resolving or reading it again", () => {
  loadAgainAfterThePreviousFile();
});

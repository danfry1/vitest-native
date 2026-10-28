import { it } from "vitest";
import { editThenLoad } from "./source-edit.js";

// Order-independent twin of the other source-edit file: each edits a Node-loaded
// source and loads it, so whichever runs second fails if the edit was not seen.
it("sees a source edited since the previous test file loaded it", () => {
  editThenLoad();
});

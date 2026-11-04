// Second file in the same hot worker: the workspace library a evaluated must be
// evaluated again, so it holds this file's store and class rather than a's.
import { test } from "vitest";
import { checkWorkspaceMember } from "./workspace-member";

test("after another file, the workspace library reads this file's store", () => {
  checkWorkspaceMember("b", 1);
});

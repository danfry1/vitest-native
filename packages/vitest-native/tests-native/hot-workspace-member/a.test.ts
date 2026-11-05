// First file in the hot worker. b and c run after it in the same worker.
import { test } from "vitest";
import { checkWorkspaceMember } from "./workspace-member";

test("the workspace library reads this file's store", () => {
  checkWorkspaceMember("a", 0);
});

// Third file to touch the workspace library, after one that did not.
import { test } from "vitest";
import { checkWorkspaceMember } from "./workspace-member";

test("the workspace library is evaluated for each file that touches it", () => {
  checkWorkspaceMember("d", 2);
});

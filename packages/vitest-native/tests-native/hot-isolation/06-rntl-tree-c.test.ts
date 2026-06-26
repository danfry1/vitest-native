// Memory gate (part 3/3): see 04-rntl-tree-a. File b's reset has now run, so the
// resident-RNTL drain must have unmounted b's tree too. This covers a NON-first
// RNTL file (b), where RNTL's own auto-cleanup never registered — so a pass here
// can only come from the drain, not from RNTL's built-in afterEach.
import { screen } from "@testing-library/react-native";
import { expect, it } from "vitest";

let leakedFromB = false;
try {
  leakedFromB = screen.queryByText("vn-hot-tree-from-b") != null;
} catch {
  leakedFromB = false;
}

it("file b's RNTL tree was unmounted by the hot runtime's resident drain", () => {
  expect(leakedFromB).toBe(false);
});

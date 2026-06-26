// Memory gate (part 2/3): see 04-rntl-tree-a. At this point file a's reset has
// run, so the resident-RNTL drain must have unmounted a's tree — the resident
// screen must not still expose it. (Without the drain, a's tree stays mounted and
// queryByText finds it.) Then render b's own tree for file c to check.
import React from "react";
import { Text } from "react-native";
import { render, screen } from "@testing-library/react-native";
import { expect, it } from "vitest";

// Captured at module-eval time, after the per-file reset for file a has run.
let leakedFromA = false;
try {
  leakedFromA = screen.queryByText("vn-hot-tree-from-a") != null;
} catch {
  // screen throws when no render is active — that is the drained/clean state.
  leakedFromA = false;
}

it("file a's RNTL tree was unmounted by the hot runtime's resident drain", () => {
  expect(leakedFromA).toBe(false);
});

it("file b renders its own RNTL tree", () => {
  render(React.createElement(Text, null, "vn-hot-tree-from-b"));
});

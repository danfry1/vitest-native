// Memory gate (part 2/3): see 04-rntl-tree-a. With the fix, file a's reset has
// run and the resident screen must not still expose a's tree. NOTE: this check is
// best-effort, not the authoritative guard — file a is the FIRST RNTL file, so
// RNTL's own auto-cleanup afterEach also registered there and may unmount a's tree
// without the drain. File 06 (checking b, a NON-first RNTL file whose afterEach
// never registers) is the deterministic guard. Here we mainly render b's tree as
// the fixture 06 inspects.
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

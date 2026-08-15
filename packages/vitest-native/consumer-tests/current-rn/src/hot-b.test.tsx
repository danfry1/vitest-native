import React from "react";
import { render } from "@testing-library/react-native";
import { Text, View } from "react-native";
import { expect, test } from "vitest";
import { count, record } from "consumer-state-fixture";
import { resolvedUrls } from "runtime-probe";

// Second file of the pair: sees hot-a's writes unless the per-file reset (and its
// ESM generation stamp) really evicted the externalized package from a packed
// install. Runs its own snapshot too — every file gets its own snapshot state, so
// one passing file says nothing about the next.

test("snapshot state is the runner's own in a second file (hot, packed)", () => {
  render(
    <View testID="hot-b">
      <Text>hot consumer B</Text>
    </View>,
  );
  // Stable-literal inline snapshot, as in hot-a: exercises SnapshotClient state
  // for THIS file (every file gets its own), without coupling to RN render props.
  expect({ file: "hot-b" }).toMatchInlineSnapshot(`
    {
      "file": "hot-b",
    }
  `);
});

test("externalized package state was reset between files", () => {
  expect(count()).toBe(0);
  record("b");
  expect(count()).toBe(1);
});

// The invariant behind the behavioral probes above, asserted directly: the ESM
// generation stamp must reach ordinary packages (the probe itself — the control)
// and must NEVER reach the test stack, whose twin would be a runtime the runner
// doesn't read. The twin's downstream symptoms are emergent and order-dependent
// (react-native-paper needed a full 52-file run to surface them), so the gate
// checks resolution, which is deterministic on any file after the first reset.
test("the test stack resolves unstamped; ordinary packages resolve stamped", () => {
  expect(resolvedUrls.self).toContain("vnhot=");
  expect(resolvedUrls.vitest).not.toContain("vnhot=");
  expect(resolvedUrls.snapshot).not.toContain("vnhot=");
  expect(resolvedUrls.chai).not.toContain("vnhot=");
  expect(resolvedUrls.engine).not.toContain("vnhot=");
});

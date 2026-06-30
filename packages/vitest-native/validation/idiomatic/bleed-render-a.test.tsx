import { test } from "vitest";
import { render } from "@testing-library/react-native";
import * as React from "react";
import { Text } from "react-native";

// Renders a uniquely-identifiable tree and does NOT explicitly unmount — relying
// on RNTL's automatic per-test cleanup. If that cleanup doesn't run across files
// under the hot runtime (RNTL is resident), bleed-render-b will still find it.
test("render a unique tree (no manual cleanup)", async () => {
  await render(<Text testID="bleed-tree">BLEED_FROM_A_b3f9</Text>);
});

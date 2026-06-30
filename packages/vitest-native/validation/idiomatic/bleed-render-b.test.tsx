import { expect, test } from "vitest";
import { render, screen } from "@testing-library/react-native";
import * as React from "react";
import { Text } from "react-native";

// THE key resident-state probe: the previous file's tree must be gone. Render a
// sentinel in THIS file, then assert the resident `screen` shows only the
// sentinel — not the prior file's tree. If RNTL's resident render store isn't
// reset per file under hot, BLEED_FROM_A_b3f9 leaks in alongside the sentinel.
test("previous file's rendered tree is NOT visible alongside this file's", async () => {
  await render(<Text>checker_sentinel_x7</Text>);
  expect(screen.queryByText("checker_sentinel_x7")).not.toBeNull();
  expect(screen.queryByText("BLEED_FROM_A_b3f9")).toBeNull();
  expect(screen.queryByTestId("bleed-tree")).toBeNull();
});

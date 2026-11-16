import React from "react";
import { Text } from "react-native";
import { configure, render, screen } from "@testing-library/react-native";
import { expect, it } from "vitest";

// One of two files on one hot worker, in either order. RNTL's configure() changes one
// module-level object, and RNTL stays loaded for the worker: each file must start from
// RNTL's defaults, as it does under Jest, whatever an earlier file configured (#807).
it("starts from RNTL's defaults, then configures it for whatever runs next", async () => {
  await render(React.createElement(Text, { style: { display: "none" } }, "hidden"));
  expect(screen.queryByText("hidden"), "a hidden element is excluded by default").toBeNull();
  configure({ defaultIncludeHiddenElements: true, asyncUtilTimeout: 4321 });
  expect(screen.queryByText("hidden")).not.toBeNull();
});

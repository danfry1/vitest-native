// RNTL reached only through a module Node loads (a shared test-utils that re-exports
// it), never through Vite's module evaluator. Under `--mode hot` RNTL is already
// resident from the earlier files, so Node returns the cached entry and only the
// native require hook sees this file load it.
import { createRequire } from "node:module";
import React from "react";
import { Text } from "react-native";
import { expect, test } from "vitest";

const { render, screen } = createRequire(import.meta.url)(
  "../fixtures/rntl-reexport/index.cjs",
) as typeof import("@testing-library/react-native");

let unmounted = 0;
function Tracked() {
  React.useEffect(
    () => () => {
      unmounted++;
    },
    [],
  );
  return <Text>re-exported screen</Text>;
}

test("renders through the re-export", async () => {
  await render(<Tracked />);
});

test("is cleaned up after its test", () => {
  expect(unmounted).toBe(1);
  expect(() => screen.getByText("re-exported screen")).toThrow();
});

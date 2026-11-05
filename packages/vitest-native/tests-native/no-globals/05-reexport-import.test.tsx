// RNTL imported through a shared test-utils module that Vite hands to Node (see
// server.deps.external in vitest.no-globals.config.mts), as from an installed package.
// This file is the first to load that module; 06 imports it again.
import React from "react";
import { Text } from "react-native";
import { render, screen } from "../fixtures/rntl-reexport/index.cjs";
import { expect, test } from "vitest";

let unmounted = 0;
function Tracked() {
  React.useEffect(
    () => () => {
      unmounted++;
    },
    [],
  );
  return <Text>imported re-export 05</Text>;
}

test("renders through the re-export", async () => {
  await render(<Tracked />);
});

test("is cleaned up after its test", () => {
  expect(unmounted).toBe(1);
  expect(() => screen.getByText("imported re-export 05")).toThrow();
});

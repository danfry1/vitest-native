// RNTL imported through a shared test-utils module that Vite hands to Node (see
// server.deps.external in vitest.no-globals.config.mts), as from an installed package.
// 05 loaded that module first. With `isolate: false` it is still in Node's module
// cache and in Vitest's module graph when this file imports it, so nothing loads and
// only the graph shows that this file reaches RNTL. Not run under `--mode hot`: the hot
// loader reloads installed packages (under node_modules) for every file, which 04
// covers, and this fixture is outside node_modules, so hot would keep 05's instance.
import React from "react";
import { Text } from "react-native";
import { render, screen } from "../fixtures/rntl-reexport/index.cjs";
import { describe, expect, test } from "vitest";

let unmounted = 0;
function Tracked() {
  React.useEffect(
    () => () => {
      unmounted++;
    },
    [],
  );
  return <Text>imported re-export 06</Text>;
}

describe.skipIf(process.env.VN_NO_GLOBALS_MODE === "hot")("an import already loaded", () => {
  test("renders through the re-export", async () => {
    await render(<Tracked />);
  });

  test("is cleaned up after its test", () => {
    expect(unmounted).toBe(1);
    expect(() => screen.getByText("imported re-export 06")).toThrow();
  });
});

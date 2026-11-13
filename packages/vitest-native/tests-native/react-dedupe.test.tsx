/**
 * A Node-owned library with its own nested copy of `react` gets the renderer's React
 * (native/react-dedupe.mjs), as a file Vite loads does through `resolve.dedupe`. The
 * library here is written at run time outside the project, with a nested `react` that is
 * not React at all, so a second copy fails loudly: no `useState`.
 */
import fs from "node:fs";
import { createRequire } from "node:module";
import os from "node:os";
import path from "node:path";
import React from "react";
import { Text } from "react-native";
import { render, screen } from "@testing-library/react-native";
import { afterAll, describe, expect, it } from "vitest";

const root = fs.mkdtempSync(path.join(os.tmpdir(), "vn-react-dedupe-"));
afterAll(() => fs.rmSync(root, { recursive: true, force: true }));

function write(file: string, text: string) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, text);
}

const lib = path.join(root, "node_modules", "react-shim-lib");
write(path.join(lib, "package.json"), JSON.stringify({ name: "react-shim-lib", main: "index.js" }));
write(
  path.join(lib, "index.js"),
  `const React = require("react");
exports.React = React;
exports.Counter = function Counter(props) {
  const [n] = React.useState(1);
  return React.createElement(props.as, null, "count " + n);
};`,
);
const nested = path.join(lib, "node_modules", "react");
write(path.join(nested, "package.json"), JSON.stringify({ name: "react", main: "index.js" }));
write(path.join(nested, "index.js"), 'module.exports = { copy: "nested" };');

describe("a Node-owned library with its own nested React", () => {
  const loaded = createRequire(path.join(lib, "index.js"))(path.join(lib, "index.js"));

  it("gets the React the test renders with", () => {
    expect(loaded.React).toBe(React);
  });

  it("runs its hooks inside the renderer's render", async () => {
    await render(<loaded.Counter as={Text} />);
    expect(screen.getByText("count 1")).toBeTruthy();
  });
});

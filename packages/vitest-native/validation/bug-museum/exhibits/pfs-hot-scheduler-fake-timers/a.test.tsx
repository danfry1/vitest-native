import { createRequire } from "node:module";
// File 1 turns fake timers on before anything in it has loaded the renderer
// (as a per-file `vi.useFakeTimers()` at the top of a file, or a setup file, does).
vi.useFakeTimers();
const loaded = () => Object.keys(createRequire(import.meta.url).cache).some((k) => /\/node_modules\/scheduler\//.test(k));

test("file 1 renders under fake timers", async () => {
  console.log(`[leak:timers] a.test.tsx scheduler already loaded before this file's first render = ${loaded()}`);
  const React = await import("react");
  const { Text } = await import("react-native");
  const { render } = await import("@testing-library/react-native");
  const view = await render(React.createElement(Text, null, "file 1"));
  expect(view.getByText("file 1")).toBeTruthy();
  vi.useRealTimers();
});

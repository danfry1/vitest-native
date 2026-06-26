import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react-native";
import { Text } from "react-native";

// Intentionally NO `import React`. RN's Babel preset uses the automatic JSX
// runtime, so RN source/tests routinely omit the React import. The native engine
// must configure esbuild the same way, or this throws "React is not defined".
describe("native engine: automatic JSX runtime", () => {
  it("renders JSX without importing React", async () => {
    await render(<Text>auto-jsx</Text>);
    expect(screen.getByText("auto-jsx")).toBeTruthy();
  });
});

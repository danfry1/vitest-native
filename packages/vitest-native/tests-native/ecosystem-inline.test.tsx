import { describe, it, expect, vi } from "vitest";
import { Banner, renderCount } from "rn-ecosystem-lib";
import { render, screen } from "@testing-library/react-native";

// rn-ecosystem-lib is published the way most of the React Native ecosystem
// publishes: untranspiled JSX in CommonJS, assuming Metro will compile it, with
// react-native declared in its own manifest. Nothing in this project's config
// mentions it — being auto-detected and inlined is the whole point.
vi.mock("rn-ecosystem-lib", async (importOriginal) => {
  const actual = await importOriginal<typeof import("rn-ecosystem-lib")>();
  return { ...actual, renderCount: () => 4242 };
});

describe("auto-detected React Native packages", () => {
  it("compiles and runs untranspiled ecosystem source with no configuration", async () => {
    await render(<Banner label="hello" />);
    // Real React Native rendered it — the package is inlined, not stubbed.
    expect(screen.getByTestId("banner").type).toBe("RCTView");
    expect(screen.getByText("hello")).toBeTruthy();
  });

  it("is reachable by vi.mock, which externalized packages are not", () => {
    expect(renderCount()).toBe(4242);
  });
});

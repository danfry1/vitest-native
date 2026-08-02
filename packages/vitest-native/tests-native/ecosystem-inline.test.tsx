import { describe, it, expect, vi } from "vitest";
import { Banner, renderCount, platformSeen } from "rn-ecosystem-lib";
import { render, screen } from "@testing-library/react-native";

// rn-ecosystem-lib is published the way most of the React Native ecosystem
// publishes: untranspiled JSX in CommonJS, assuming Metro will compile it, with
// react-native declared in its own manifest. Nothing in this project's config
// mentions it — being auto-detected is the whole point.
vi.mock("rn-ecosystem-lib", async (importOriginal) => {
  const actual = await importOriginal<typeof import("rn-ecosystem-lib")>();
  return { ...actual, renderCount: () => 4242 };
});

// React Native itself, mocked with a distinguishable Platform.OS. The test graph
// reaches RN through a facade module the plugin owns, which is what makes this
// interceptable at all; the library reaches it by require() and does not.
vi.mock("react-native", async (importOriginal) => {
  const actual = await importOriginal<typeof import("react-native")>();
  return { ...actual, Platform: { ...actual.Platform, OS: "mocked-os" } };
});

describe("auto-detected React Native packages", () => {
  it("compiles and runs untranspiled ecosystem source with no configuration", async () => {
    await render(<Banner label="hello" />);
    // Real React Native rendered it — the package is compiled, not stubbed.
    expect(screen.getByTestId("banner").type).toBe("RCTView");
    expect(screen.getByText("hello")).toBeTruthy();
  });

  it("is reachable by vi.mock", () => {
    expect(renderCount()).toBe(4242);
  });

  it("still sees the real React Native even when the test mocks it", async () => {
    // Documented scope: mocking react-native rewrites what the TEST graph imports.
    // The library's own imports compile to require(), which reaches React Native
    // directly — so a library never observes the test's mock.
    //
    // This assertion used to read `Platform.OS === "ios"` with nothing in the file
    // mocking react-native at all, so it could not fail from the behaviour its own
    // name describes. The two views are now distinguishable at run time.
    const { Platform } = await import("react-native");
    expect(Platform.OS).toBe("mocked-os");
    expect(platformSeen()).toBe("ios");
  });
});

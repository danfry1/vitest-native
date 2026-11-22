// vi.mock of a react-native/Libraries path reaches React Native's own require of it with
// experimental.nodeMocks (--mode node-mocks), keyed by the platform file (#573).
import { BackHandler } from "react-native";
import { expect, it, vi } from "vitest";

vi.mock("react-native/Libraries/Utilities/BackHandler", () => ({
  __esModule: true,
  default: { addEventListener: () => ({ remove() {} }), exitApp: vi.fn(), viMocked: true },
}));

it("serves a vi.mock of a platform-specific module", () => {
  expect((BackHandler as unknown as { viMocked?: boolean }).viMocked).toBe(true);
});

// The override pattern with importOriginal: the original is the platform file, not the
// shim React Native's `exports` map names for the path, so it does not come back here.
vi.mock("react-native/Libraries/Utilities/Platform", async (importOriginal) => ({
  ...(await importOriginal<Record<string, unknown>>()),
  OS: "android",
}));

it("spreads the original Platform module into a vi.mock", async () => {
  const platform = await import("react-native/Libraries/Utilities/Platform");
  expect((platform as { OS?: string }).OS).toBe("android");
  expect((platform.default as { OS: string }).OS).toBe("ios");
});

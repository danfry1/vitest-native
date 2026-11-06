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

/**
 * A vi.mock of react-native stays in Vite's graph: Vite keys it by the engine's facade
 * id, which is no file, and the facade's own require of react-native is how the
 * factory's importOriginal() reaches React Native.
 */
import { expect, it, vi } from "vitest";
import { Platform } from "react-native";
import { requireFrom } from "dispatch-consumer-lib";

vi.mock("react-native", async (importOriginal) => ({
  ...(await importOriginal<typeof import("react-native")>()),
  Platform: { OS: "mocked", select: (o: Record<string, unknown>) => o.default },
}));

it("mocks the test's import, and leaves an installed package's require on the registry", () => {
  expect(Platform.OS).toBe("mocked");
  expect(requireFrom("react-native").Platform.OS).toBe("ios");
});

import { defineConfig } from "vitest/config";
import { reactNative } from "vitest-native";

// Mock engine + RNTL 14 — the only combination in CI that pairs them, and the
// one that surfaced the disabled-press regression fixed in #18. RNTL 14 made
// render/fireEvent async and added findEventHandlerFromFiber, which re-finds
// onPress on the wrapping forwardRef mock, so host-prop stripping alone no
// longer blocks the press. The mock marks disabled hosts with
// pointerEvents:"none" so RNTL's isEventEnabled() rejects the handler.
export default defineConfig({
  plugins: [reactNative({ engine: "mock" })],
  test: {
    environment: "node",
    globals: true,
  },
});

import { describe, expect, it } from "vitest";
import { DeviceEventEmitter } from "react-native";

// A frame inside React Native must name the React Native file, not the registry's cache
// file. Vitest replaces Error.prepareStackTrace in its workers and maps only the files it
// evaluates, so this has to hold without a source map, under Vitest itself.
function stackThroughReactNative(): string {
  let stack = "";
  const subscription = DeviceEventEmitter.addListener("vn-stack-probe", () => {
    stack = new Error("probe").stack ?? "";
  });
  DeviceEventEmitter.emit("vn-stack-probe");
  subscription.remove();
  return stack;
}

describe("native engine: stack frames inside React Native", () => {
  it("name the real React Native file, line and column", () => {
    expect((globalThis as Record<string, unknown>).__vitest_native_registry_installed).toBe(true);
    const stack = stackThroughReactNative();
    expect(stack).toMatch(
      /[\\/]react-native[\\/]Libraries[\\/]vendor[\\/]emitter[\\/]EventEmitter\.js:\d+:\d+\)/,
    );
    expect(stack).not.toMatch(/rn-(ios|android)-[0-9a-f]+\.cjs/);
  });

  it("leave Node's source-map support as the run configured it", () => {
    expect(process.sourceMapsEnabled).toBe(false);
  });
});

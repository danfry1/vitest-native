// React Native's JS expects a handful of globals to exist at runtime (it reads
// them during module init and rendering). The native setup installs them; without
// them real RN throws on import. These assert the contract the engine provides.
import { describe, expect, it } from "vitest";

describe("native engine: React Native runtime globals", () => {
  it("installs __DEV__", () => {
    expect((globalThis as Record<string, unknown>).__DEV__).toBe(true);
  });

  it("installs requestAnimationFrame / cancelAnimationFrame", () => {
    expect(typeof requestAnimationFrame).toBe("function");
    expect(typeof cancelAnimationFrame).toBe("function");
  });

  it("marks the React act + React Native test environment", () => {
    const g = globalThis as Record<string, unknown>;
    expect(g.IS_REACT_ACT_ENVIRONMENT).toBe(true);
    expect(g.IS_REACT_NATIVE_TEST_ENVIRONMENT).toBe(true);
  });

  it("provides the batched-bridge config RN core reads at init", () => {
    expect((globalThis as Record<string, unknown>).__fbBatchedBridgeConfig).toBeDefined();
  });
});

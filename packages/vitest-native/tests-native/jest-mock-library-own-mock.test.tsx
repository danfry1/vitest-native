/**
 * The line a Jest suite using Reanimated carries:
 * `jest.mock('react-native-reanimated', () => require('react-native-reanimated/mock'))`.
 * Reanimated's mock loads the real package with `import … from './index'`. The engine
 * resolves the package as Metro does (its `react-native` field, `src/index`), so that
 * file is the one the mock is registered for; under Jest it is not (Jest resolves
 * `main`), and the package's own relative import gets the real module. It does here too
 * (jest-compat/node-registry.mjs, isPackageOwnRelativeLoad), where it was reported as the
 * factory requiring itself.
 */
import { describe, expect, it } from "vitest";
import { withTiming, interpolateColor } from "react-native-reanimated";

declare const jest: { mock(path: string, factory: () => unknown): void };

jest.mock("react-native-reanimated", () => require("react-native-reanimated/mock"));

describe("jest.mock of a package with its own mock", () => {
  it("loads, and is the mock", () => {
    expect(typeof interpolateColor).toBe("function");
    const finished: unknown[] = [];
    withTiming(1, {}, (done?: boolean) => finished.push(done));
    expect(finished).toEqual([true]);
  });
});

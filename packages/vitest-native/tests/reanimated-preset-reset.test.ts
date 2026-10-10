/**
 * Reanimated's animation builders have to keep chaining after Vitest resets mocks.
 *
 * `vi.resetAllMocks()`, and `mockReset: true`, which runs it before every test, drop
 * an implementation set with `.mockReturnValue()` or `.mockReturnThis()`. They keep
 * the one passed to `vi.fn(impl)`. The builders' modifiers were made the first way,
 * so after a reset `FadeIn.duration(300)` returned undefined and
 * `LinearTransition.springify().damping(20)` threw a TypeError.
 *
 * The modifiers must still be spies after the fix: a test may assert on how a
 * component configured its animation.
 */
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { reanimated } from "../src/presets/reanimated.js";

/** The module object a worker would get for react-native-reanimated. */
function moduleFor(): Record<string, any> {
  const preset = reanimated();
  return preset.modules["react-native-reanimated"].factory();
}

/** Every export with the layout-animation builder's chainable surface. */
function buildersOf(m: Record<string, any>): [string, Record<string, any>][] {
  return Object.entries(m).filter(([, value]) => typeof value?.springify === "function");
}

describe("reanimated preset: builders after vi.resetAllMocks()", () => {
  it("an entering animation still chains", () => {
    const m = moduleFor();
    vi.resetAllMocks();
    expect(m.FadeIn.duration(300).springify().damping(20)).toBe(m.FadeIn);
  });

  it("a layout transition still chains", () => {
    const m = moduleFor();
    vi.resetAllMocks();
    expect(m.LinearTransition.springify().damping(20)).toBe(m.LinearTransition);
    expect(m.Layout.duration(200).delay(50)).toBe(m.Layout);
  });

  it("every modifier of every builder returns its builder", () => {
    const m = moduleFor();
    vi.resetAllMocks();
    const builders = buildersOf(m);
    expect(builders.length).toBeGreaterThan(0);
    for (const [name, builder] of builders) {
      for (const [modifier, fn] of Object.entries(builder)) {
        if (modifier === "build") continue;
        expect(fn(1), `${name}.${modifier}() should return ${name}`).toBe(builder);
      }
    }
  });

  it("the modifiers are still spies", () => {
    const m = moduleFor();
    vi.resetAllMocks();
    m.FadeIn.duration(300).springify().damping(20);
    expect(m.FadeIn.duration).toHaveBeenCalledWith(300);
    expect(m.FadeIn.springify).toHaveBeenCalledTimes(1);
    expect(m.FadeIn.damping).toHaveBeenCalledWith(20);
  });

  it("SharedTransition still chains", () => {
    const m = moduleFor();
    vi.resetAllMocks();
    const custom = () => ({});
    expect(m.SharedTransition.duration(300).custom(custom)).toBe(m.SharedTransition);
    expect(m.SharedTransition.custom).toHaveBeenCalledWith(custom);
  });

  it("every SharedTransition method returns SharedTransition", () => {
    const m = moduleFor();
    vi.resetAllMocks();
    for (const method of Object.keys(m.SharedTransition)) {
      // Called as a method: these return `this`.
      expect(
        m.SharedTransition[method](1),
        `SharedTransition.${method}() should return SharedTransition`,
      ).toBe(m.SharedTransition);
    }
  });
});

describe("reanimated preset: builders under mockReset: true", () => {
  // Built once, as a test file's import is, and reset by the runner before each test.
  let m: Record<string, any>;

  beforeAll(() => {
    vi.setConfig({ mockReset: true });
    m = moduleFor();
  });

  afterAll(() => {
    vi.resetConfig();
  });

  it("a builder configured in one test still chains in the next", () => {
    expect(m.LinearTransition.springify().damping(20)).toBe(m.LinearTransition);
  });

  it("the reset still clears the calls between tests", () => {
    expect(m.LinearTransition.springify).not.toHaveBeenCalled();
    expect(m.FadeIn.duration(300).delay(100)).toBe(m.FadeIn);
  });
});

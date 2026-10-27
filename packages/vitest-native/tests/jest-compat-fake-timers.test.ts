/**
 * `jest.useFakeTimers(config)` translates Jest's options the way Jest does
 * (`_toSinonFakeTimersConfig`, @jest/fake-timers 30.2) before handing them to
 * `vi.useFakeTimers`, which would otherwise drop every Jest-only key. The behaviour
 * this produces under the jest-compat setup is in
 * tests-native/jest-compat-timers.test.ts; this file pins the translation and the
 * list of fakeable APIs it is computed from.
 */
import { readFileSync, readdirSync } from "node:fs";
import { createRequire } from "node:module";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { FAKEABLE_TIMER_APIS, toVitestFakeTimersConfig } from "../src/jest-compat/jest-object.mjs";

const translate = (config?: Record<string, unknown>) =>
  toVitestFakeTimersConfig(config) as Record<string, unknown>;

describe("toVitestFakeTimersConfig", () => {
  it("passes Jest's loopLimit default, and nothing else, for no config", () => {
    // Jest's `timerLimit || 100_000`; Vitest's own default is 10_000.
    expect(translate()).toEqual({ loopLimit: 100_000 });
    expect(translate({})).toEqual({ loopLimit: 100_000 });
    expect(translate({ timerLimit: 50 })).toEqual({ loopLimit: 50 });
    // `||`, as in Jest: 0 is not a limit.
    expect(translate({ timerLimit: 0 })).toEqual({ loopLimit: 100_000 });
  });

  it("advanceTimers: true auto-advances with sinon's own delta", () => {
    expect(translate({ advanceTimers: true })).toEqual({
      loopLimit: 100_000,
      shouldAdvanceTime: true,
    });
  });

  it("advanceTimers: <number> is the delta", () => {
    expect(translate({ advanceTimers: 40 })).toEqual({
      loopLimit: 100_000,
      shouldAdvanceTime: true,
      advanceTimeDelta: 40,
    });
    expect(translate({ advanceTimers: false })).toMatchObject({ shouldAdvanceTime: false });
  });

  it("now is passed only when given", () => {
    expect(translate({ now: 1234 })).toMatchObject({ now: 1234 });
    expect("now" in translate({ now: undefined })).toBe(false);
  });

  it("doNotFake becomes the fakeable list minus the named APIs and Vitest's kept-real two", () => {
    const { toFake } = translate({ doNotFake: ["performance", "Date"] }) as { toFake: string[] };
    expect(toFake).not.toContain("performance");
    expect(toFake).not.toContain("Date");
    // Vitest never fakes these unless asked (Jest does); doNotFake does not ask.
    expect(toFake).not.toContain("nextTick");
    expect(toFake).not.toContain("queueMicrotask");
    expect(toFake).toContain("setTimeout");
    expect(toFake).toContain("hrtime");
    expect(translate({ doNotFake: [] }).toFake).toEqual(
      FAKEABLE_TIMER_APIS.filter((api) => api !== "nextTick" && api !== "queueMicrotask"),
    );
  });

  it("legacyFakeTimers fakes the timer functions only, ignoring the modern options", () => {
    const out = translate({ legacyFakeTimers: true, advanceTimers: true, now: 5, doNotFake: [] });
    expect(out).toEqual({
      loopLimit: 100_000,
      shouldAdvanceTime: false,
      toFake: [
        "setTimeout",
        "clearTimeout",
        "setInterval",
        "clearInterval",
        "setImmediate",
        "clearImmediate",
        "requestAnimationFrame",
        "cancelAnimationFrame",
      ],
    });
    expect(translate({ legacyFakeTimers: false, advanceTimers: true })).toEqual(
      translate({ advanceTimers: true }),
    );
  });

  it("keeps keys that are not Jest's", () => {
    expect(translate({ shouldClearNativeTimers: false })).toMatchObject({
      shouldClearNativeTimers: false,
    });
  });
});

describe("FAKEABLE_TIMER_APIS", () => {
  it("covers every FakeMethod of the @sinonjs/fake-timers bundled in the installed Vitest", () => {
    // Vitest bundles sinon into a dist chunk; its JSDoc names the fakeable APIs. A
    // name missing from FAKEABLE_TIMER_APIS would stay real under any `doNotFake`,
    // where Vitest's default would have faked it. Extra names are harmless: Vitest
    // installs with `ignoreMissingTimers: true`.
    const require = createRequire(import.meta.url);
    const dist = path.join(path.dirname(require.resolve("vitest/package.json")), "dist");
    const files = readdirSync(dist, { recursive: true, encoding: "utf8" }).filter((f) =>
      f.endsWith(".js"),
    );
    const typedef = /@typedef \{((?:"\w+" \| )*"\w+")\} FakeMethod\b/;
    let union: string[] | undefined;
    for (const file of files) {
      const match = typedef.exec(readFileSync(path.join(dist, file), "utf8"));
      if (match) {
        union = [...match[1].matchAll(/"(\w+)"/g)].map((m) => m[1]);
        break;
      }
    }
    expect(union, "FakeMethod typedef not found in vitest/dist").toBeDefined();
    expect(union!.filter((api) => !FAKEABLE_TIMER_APIS.includes(api))).toEqual([]);
  });
});

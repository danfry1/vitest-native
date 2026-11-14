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

/** The real clock the translation reads when no `now` is given. */
const REAL_NOW = 1_700_000_000_000;
const translate = (config?: Record<string, unknown>, projectFakesApis = false) =>
  toVitestFakeTimersConfig(config, () => REAL_NOW, projectFakesApis) as Record<string, unknown>;
/** What Jest fakes by default, less `nextTick`: queueMicrotask included (#835). */
const FAKED = FAKEABLE_TIMER_APIS.filter((api) => api !== "nextTick");

describe("toVitestFakeTimersConfig", () => {
  it("passes Jest's loopLimit default, the real clock and Jest's faked APIs for no config", () => {
    // Jest's `timerLimit || 100_000`; Vitest's own default is 10_000.
    expect(translate()).toEqual({ loopLimit: 100_000, now: REAL_NOW, toFake: FAKED });
    expect(translate({})).toEqual({ loopLimit: 100_000, now: REAL_NOW, toFake: FAKED });
    expect(translate({ timerLimit: 50 })).toEqual({ loopLimit: 50, now: REAL_NOW, toFake: FAKED });
    // `||`, as in Jest: 0 is not a limit.
    expect(translate({ timerLimit: 0 })).toMatchObject({ loopLimit: 100_000 });
  });

  it("fakes queueMicrotask as Jest does, and never nextTick", () => {
    expect(translate().toFake).toContain("queueMicrotask");
    expect(translate().toFake).not.toContain("nextTick");
    expect(translate({ doNotFake: ["queueMicrotask"] }).toFake).toEqual(
      FAKED.filter((api) => api !== "queueMicrotask"),
    );
  });

  it("leaves the faked APIs to a project whose test.fakeTimers names them", () => {
    expect(translate(undefined, true)).toEqual({ loopLimit: 100_000, now: REAL_NOW });
    // A doNotFake on the call still names the list, as Jest's call config wins.
    expect(translate({ doNotFake: ["Date"] }, true).toFake).toEqual(
      FAKED.filter((api) => api !== "Date"),
    );
  });

  it("keeps a call's own Vitest toFake or toNotFake", () => {
    expect(translate({ toFake: ["setTimeout"] }).toFake).toEqual(["setTimeout"]);
    expect(translate({ toFake: ["setTimeout"], doNotFake: ["Date"] }).toFake).toEqual([
      "setTimeout",
    ]);
    // doNotFake still subtracts from the call's own list.
    expect(
      translate({ toFake: ["setTimeout", "queueMicrotask"], doNotFake: ["queueMicrotask"] }).toFake,
    ).toEqual(["setTimeout"]);
    expect(translate({ toNotFake: ["Date"] })).toEqual({
      loopLimit: 100_000,
      now: REAL_NOW,
      toNotFake: ["Date"],
    });
  });

  it("advanceTimers: true auto-advances with sinon's own delta", () => {
    expect(translate({ advanceTimers: true })).toEqual({
      loopLimit: 100_000,
      now: REAL_NOW,
      shouldAdvanceTime: true,
      toFake: FAKED,
    });
  });

  it("advanceTimers: <number> is the delta", () => {
    expect(translate({ advanceTimers: 40 })).toEqual({
      loopLimit: 100_000,
      now: REAL_NOW,
      shouldAdvanceTime: true,
      advanceTimeDelta: 40,
      toFake: FAKED,
    });
    expect(translate({ advanceTimers: false })).toMatchObject({ shouldAdvanceTime: false });
  });

  it("now is Jest's `now ?? Date.now()`, read from the real clock", () => {
    expect(translate({ now: 1234 })).toMatchObject({ now: 1234 });
    expect(translate({ now: 0 })).toMatchObject({ now: 0 });
    expect(translate({ now: undefined })).toMatchObject({ now: REAL_NOW });
    expect(translate({ now: null })).toMatchObject({ now: REAL_NOW });
  });

  it("doNotFake becomes the fakeable list minus the named APIs and nextTick", () => {
    const { toFake } = translate({ doNotFake: ["performance", "Date"] }) as { toFake: string[] };
    expect(toFake).not.toContain("performance");
    expect(toFake).not.toContain("Date");
    // nextTick stays real; queueMicrotask is faked, as in Jest.
    expect(toFake).not.toContain("nextTick");
    expect(toFake).toContain("queueMicrotask");
    expect(toFake).toContain("setTimeout");
    expect(toFake).toContain("hrtime");
    expect(translate({ doNotFake: [] }).toFake).toEqual(FAKED);
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

/**
 * The `FakeMethod` union of the @sinonjs/fake-timers that the installed Vitest bundles,
 * read from the JSDoc typedef in its dist chunk, or undefined when the bundle carries
 * no typedef.
 */
function bundledFakeMethods(dist: string): string[] | undefined {
  const files = readdirSync(dist, { recursive: true, encoding: "utf8" }).filter((f) =>
    f.endsWith(".js"),
  );
  const typedef = /@typedef \{((?:"\w+" \| )*"\w+")\} FakeMethod\b/;
  for (const file of files) {
    const match = typedef.exec(readFileSync(path.join(dist, file), "utf8"));
    if (match) return [...match[1].matchAll(/"(\w+)"/g)].map((m) => m[1]);
  }
  return undefined;
}

const require = createRequire(import.meta.url);
const vitestPkg = require.resolve("vitest/package.json");
const fakeMethods = bundledFakeMethods(path.join(path.dirname(vitestPkg), "dist"));

describe("FAKEABLE_TIMER_APIS", () => {
  // A name missing from FAKEABLE_TIMER_APIS would stay real under any `doNotFake`,
  // where Vitest's default would have faked it. Extra names are harmless: Vitest
  // installs with `ignoreMissingTimers: true`. A missing typedef fails.
  it("covers every FakeMethod of the bundled @sinonjs/fake-timers", () => {
    expect(fakeMethods, "FakeMethod typedef not found in vitest/dist").toBeDefined();
    expect(fakeMethods!.filter((api) => !FAKEABLE_TIMER_APIS.includes(api))).toEqual([]);
  });
});

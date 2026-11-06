/**
 * vi.resetAllMocks() returns with a jest.spyOn spy whose original cannot be constructed.
 *
 * jest-compat gives such a spy a resting implementation (jest-object.mjs,
 * withJestSemantics) and re-installs it after mockReset(). Vitest's resetAllMocks()
 * iterates its set of dirty mocks with for…of; mockReset() took the mock out and the
 * re-install put it back at the end, so the loop visited it forever and the worker spun
 * at full CPU. A synchronous loop cannot be stopped by a test timeout, so the reset runs
 * in a child process with a deadline of its own.
 */
import { spawnSync } from "node:child_process";
import { createRequire } from "node:module";
import { pathToFileURL } from "node:url";
import { expect, it } from "vitest";

const fromVitest = createRequire(createRequire(import.meta.url).resolve("vitest/package.json"));
const spyModule = pathToFileURL(fromVitest.resolve("@vitest/spy")).href;
const jestObject = new URL("../src/jest-compat/jest-object.mjs", import.meta.url).href;

it("resetAllMocks() returns, spies fall back to their originals, and keep Jest's semantics", () => {
  const script = `
    import { clearAllMocks, fn, isMockFunction, resetAllMocks, spyOn } from ${JSON.stringify(spyModule)};
    import { createJestObject } from ${JSON.stringify(jestObject)};
    const jest = createJestObject({ fn, spyOn, isMockFunction, resetAllMocks, clearAllMocks });
    const mod = { add: (a, b) => a + b, twice: (n) => n * 2, arrow: () => ({ made: "arrow" }) };
    // Given an implementation, then reset: the original again, and calls counted afresh.
    const add = jest.spyOn(mod, "add").mockImplementation(() => 0);
    const mocked = mod.add(1, 2);
    resetAllMocks();
    const afterReset = mod.add(1, 2);
    const callsAfterReset = add.mock.calls.length;
    jest.resetAllMocks();
    const afterJestReset = mod.add(2, 2);
    // Never given an implementation.
    jest.spyOn(mod, "twice");
    resetAllMocks();
    const twice = mod.twice(2);
    // new on a spied arrow still calls it after the resets, as jest-mock's spyOn has it.
    const arrow = jest.spyOn(mod, "arrow");
    resetAllMocks();
    clearAllMocks();
    // A value set after a reset is reset by the next one, with no call in between: the
    // check that ends the loop reads the mock's state, so it cannot keep a stale
    // "already reset".
    const quiet = { none: () => undefined };
    const none = jest.spyOn(quiet, "none");
    resetAllMocks();
    none.mockReturnValue(1);
    const set = none.getMockImplementation()();
    resetAllMocks();
    const value = quiet.none();
    none.mockReturnValueOnce(2);
    resetAllMocks();
    const once = quiet.none();
    none.mockReturnThis();
    resetAllMocks();
    const self = quiet.none();
    none.mockName("named");
    resetAllMocks();
    const name = none.getMockName();
    console.log(JSON.stringify({
      mocked, afterReset, callsAfterReset, afterJestReset, twice, constructed: new arrow(),
      afterMockReturnValue: { set, value: value ?? "undefined", once: once ?? "undefined", self: self ?? "undefined" },
      nameReset: name !== "named",
    }));
  `;
  const run = spawnSync(process.execPath, ["--input-type=module", "-e", script], {
    encoding: "utf8",
    timeout: 10_000,
  });
  expect(run.signal, "resetAllMocks() never returned").toBe(null);
  expect(run.status, run.stderr).toBe(0);
  expect(JSON.parse(run.stdout)).toEqual({
    mocked: 0,
    afterReset: 3,
    callsAfterReset: 1,
    afterJestReset: 4,
    twice: 4,
    constructed: { made: "arrow" },
    afterMockReturnValue: { set: 1, value: "undefined", once: "undefined", self: "undefined" },
    nameReset: true,
  });
});

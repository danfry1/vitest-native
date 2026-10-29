// The probe catalog of the configuration-axis matrix (docs/config-axis-matrix.md).
//
// Each probe asserts the CORRECT behaviour — what Jest, a device, or Vitest's own
// semantics would give — never what the engine happens to do today. Where it fails today
// on some cells, known-failing.json says which cells and which pull request fixes it.
//
//   id        the name used in known-failing.json and in the run's report
//   files     test files under fixture/apps/app/probes that make up the probe
//   requires  axis values (install or runtime; a value or a list) the probe needs to
//             RUN at all: the hot pairs need the hot runtime, the jest-compat probes a
//             global jest, reanimated a native engine. Elsewhere it is reported as n/a.
//   observes  axis values it additionally needs to OBSERVE its defect. Elsewhere it still
//             runs, because the behaviour it asserts is still correct there and can still
//             regress, but a pass is reported as "unobserved", not as a pass: a probe that
//             cannot observe its defect must not count as evidence that the defect is
//             gone. A failure there is a REGRESSION like any other. That covers engine
//             blindness (the mock engine has no Node-side aliasing, interop or
//             RCTVirtualText to get wrong), RNTL 14 (renders without the recoverable-error
//             path), layout (only pnpm names store directories after peers) and Vitest 5
//             (no mock placeholder to replay).
//   alone     run in its own Vitest process, because its verdict includes the exit code,
//             the unhandled errors or the files the run lost (accounting.mjs)
//   output    a check of the run's output instead of test files (shared run's stderr)
//   bug       the defect the probe guards against, in one line

export const PROBES = [
  {
    id: "rntl-auto-cleanup",
    files: ["rntl-auto-cleanup.test.tsx"],
    bug: "RNTL's auto-cleanup registers only when afterEach is a global",
  },
  {
    id: "rntl-findby-fake-timers",
    files: ["rntl-findby-fake-timers.test.tsx"],
    bug: "RNTL advances fake timers only through a global jest",
  },
  {
    id: "rntl-nested-text",
    files: ["rntl-nested-text.test.tsx"],
    observes: { engine: "native" },
    bug: "nested Text (RCTVirtualText) is not a text host on RNTL 12/13",
  },
  {
    id: "recoverable-error",
    files: ["recoverable-error.test.tsx"],
    observes: { rntl: ["12", "13"] },
    alone: true,
    bug: "a recoverable React error exits 1 with every test passing",
  },
  {
    id: "partial-mock-store",
    files: ["partial-mock-store.test.ts"],
    requires: { jestCompat: "on" },
    bug: "a partial mock of project source gets a second module graph",
  },
  {
    id: "aliased-sibling-string",
    files: ["aliased-sibling-string.test.ts"],
    observes: { engine: "native" },
    bug: "a workspace library string-aliased to source loads twice",
  },
  {
    id: "aliased-sibling-regex",
    files: ["aliased-sibling-regex.test.ts"],
    observes: { engine: "native" },
    bug: "a workspace library regex-aliased to source cannot be found by Node",
  },
  {
    id: "aliased-source-import-meta",
    files: ["aliased-source-import-meta.test.ts"],
    observes: { engine: "native" },
    bug: "aliased workspace source using import.meta is a SyntaxError under Node",
  },
  {
    id: "esm-default-interop",
    files: ["esm-default-interop.test.ts"],
    observes: { engine: "native" },
    bug: "an ES module's default import of __esModule CommonJS is undefined",
  },
  {
    id: "jest-fake-timer-options",
    files: ["jest-fake-timer-options.test.ts"],
    requires: { jestCompat: "on" },
    bug: "jest.useFakeTimers drops Jest's options",
  },
  {
    id: "jest-error-equality",
    files: ["jest-error-equality.test.ts"],
    requires: { jestCompat: "on" },
    bug: "errors with per-instance methods are unequal under jest-compat",
  },
  {
    id: "hot-automock",
    files: ["hot-automock-a.test.ts", "hot-automock-b.test.ts"],
    requires: { hot: "on" },
    observes: { vitest: "4" },
    bug: "under hot on Vitest 4.1, an automock replays another file's factory",
  },
  {
    id: "hot-rn-module-mock",
    files: ["hot-rn-module-mock-a.test.ts", "hot-rn-module-mock-b.test.ts"],
    requires: { hot: "on", jestCompat: "on" },
    // Alone: the defect loses every later file in the worker, which in the shared run
    // would bury the other probes.
    alone: true,
    bug: "under hot, a jest.mock of a React Native module to null loses the next file (#350)",
  },
  {
    id: "native-ext-peer",
    files: ["native-ext-peer.test.ts"],
    // The mock engine has no platform resolution for externalized packages; only a pnpm
    // store names a directory after a peer.
    requires: { engine: "native" },
    observes: { layout: "isolated" },
    bug: "a library whose pnpm store directory names worklets loses its .native files (#349)",
  },
  {
    id: "reanimated-render",
    files: ["reanimated-render.test.tsx"],
    requires: { engine: "native", layout: "isolated" },
    bug: "reanimated in a pnpm store, where its directory names worklets (#349)",
  },
  {
    id: "preset-banner",
    output: true,
    bug: "the engine banner does not name the presets it applies",
    // The fixture depends on react-native-safe-area-context, whose preset applies under
    // both engines, so the banner must name it.
    check: (output) => {
      const banner = output.split("\n").find((line) => line.includes("[vitest-native] engine:"));
      if (!banner) return "no engine banner in the output";
      return /mocked: [^\n]*\bsafeAreaContext\b/.test(banner)
        ? null
        : `the banner does not name the safeAreaContext preset: ${banner.trim()}`;
    },
  },
];

const holds = (values, run) =>
  Object.entries(values ?? {}).every(([axis, value]) =>
    (Array.isArray(value) ? value : [value]).includes(run[axis]),
  );

/** Whether `probe` can run in `run`, a full assignment of every axis. */
export function runs(probe, run) {
  return holds(probe.requires, run);
}

/** Whether `probe` can observe its defect in `run`, a full assignment of every axis. */
export function applies(probe, run) {
  return runs(probe, run) && holds(probe.observes, run);
}

const assignment = (cell, run) => {
  const { runs: _runs, ...install } = cell;
  return { ...install, ...run };
};

/**
 * The probes that run in one run of a cell: `requires` is judged on the cell's install
 * axes and the run's runtime axes together. (Judged on the run alone, every probe that
 * requires an install axis would be n/a everywhere, silently.)
 */
export function activeProbes(probes, cell, run) {
  return probes.filter(
    (probe) => !(run.excludes ?? []).includes(probe.id) && runs(probe, assignment(cell, run)),
  );
}

/** Whether an active probe can observe its defect in this run of the cell. */
export function observes(probe, cell, run) {
  return applies(probe, assignment(cell, run));
}

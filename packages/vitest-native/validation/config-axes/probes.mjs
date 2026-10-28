// The probe catalog of the configuration-axis matrix (docs/config-axis-matrix.md).
//
// Each probe asserts the CORRECT behaviour — what Jest, a device, or Vitest's own
// semantics would give — never what the engine happens to do today. Where it fails today
// on some cells, known-failing.json says which cells and which pull request fixes it.
//
//   id        the name used in known-failing.json and in the report
//   files     test files under fixture/apps/app/probes that make up the probe
//   requires  axis values (install or runtime; a value or a list) the probe needs to
//             observe its defect. Elsewhere it is reported as n/a, not as a pass: a probe
//             that cannot observe its defect must not count as evidence. That covers
//             engine blindness (the mock engine has no Node-side aliasing, interop or
//             RCTVirtualText to get wrong), install axes (RNTL 14 renders without the
//             recoverable-error path, only pnpm names store directories after peers,
//             Vitest 5 has no mock placeholder to replay) and runtime axes.
//   alone     run in its own Vitest process, because its verdict includes the exit code,
//             the unhandled errors or the files the run lost (accounting.mjs)
//   output    a check of the run's output instead of test files (shared run's stderr)
//   bug       the report item it was written from (monorepo migration report, 2026-10)

export const PROBES = [
  {
    id: "rntl-auto-cleanup",
    files: ["rntl-auto-cleanup.test.tsx"],
    bug: "#17: RNTL's auto-cleanup registers only when afterEach is a global",
  },
  {
    id: "rntl-findby-fake-timers",
    files: ["rntl-findby-fake-timers.test.tsx"],
    bug: "#18: RNTL advances fake timers only through a global jest",
  },
  {
    id: "rntl-nested-text",
    files: ["rntl-nested-text.test.tsx"],
    requires: { engine: "native" },
    bug: "#16: nested Text (RCTVirtualText) is not a text host on RNTL 12/13",
  },
  {
    id: "recoverable-error",
    files: ["recoverable-error.test.tsx"],
    requires: { rntl: ["12", "13"] },
    alone: true,
    bug: "#13: a recoverable React error exits 1 with every test passing",
  },
  {
    id: "partial-mock-store",
    files: ["partial-mock-store.test.ts"],
    requires: { jestCompat: "on" },
    bug: "#10: a partial mock of project source gets a second module graph",
  },
  {
    id: "aliased-sibling-string",
    files: ["aliased-sibling-string.test.ts"],
    requires: { engine: "native" },
    bug: "#1: a workspace library string-aliased to source loads twice",
  },
  {
    id: "aliased-sibling-regex",
    files: ["aliased-sibling-regex.test.ts"],
    requires: { engine: "native" },
    bug: "#1: a workspace library regex-aliased to source cannot be found by Node",
  },
  {
    id: "aliased-source-import-meta",
    files: ["aliased-source-import-meta.test.ts"],
    requires: { engine: "native" },
    bug: "#1: aliased workspace source using import.meta is a SyntaxError under Node",
  },
  {
    id: "esm-default-interop",
    files: ["esm-default-interop.test.ts"],
    requires: { engine: "native" },
    bug: "#15: an ES module's default import of __esModule CommonJS is undefined",
  },
  {
    id: "jest-fake-timer-options",
    files: ["jest-fake-timer-options.test.ts"],
    requires: { jestCompat: "on" },
    bug: "#8: jest.useFakeTimers drops Jest's options",
  },
  {
    id: "jest-error-equality",
    files: ["jest-error-equality.test.ts"],
    requires: { jestCompat: "on" },
    bug: "#7: errors with per-instance methods are unequal under jest-compat",
  },
  {
    id: "hot-automock",
    files: ["hot-automock-a.test.ts", "hot-automock-b.test.ts"],
    requires: { hot: "on", vitest: "4" },
    bug: "#14: under hot on Vitest 4.1, an automock replays another file's factory",
  },
  {
    id: "hot-rn-module-mock",
    files: ["hot-rn-module-mock-a.test.ts", "hot-rn-module-mock-b.test.ts"],
    requires: { hot: "on", jestCompat: "on" },
    // Alone: the defect loses every later file in the worker, which in the shared run
    // would bury the other probes.
    alone: true,
    bug: "#350: under hot, a jest.mock of a React Native module to null loses the next file",
  },
  {
    id: "native-ext-peer",
    files: ["native-ext-peer.test.ts"],
    // Only a pnpm store names a directory after a peer, and the mock engine has no
    // platform resolution for externalized packages to get wrong.
    requires: { engine: "native", layout: "isolated" },
    bug: "#349: a library whose pnpm store directory names worklets loses its .native files",
  },
  {
    id: "reanimated-render",
    files: ["reanimated-render.test.tsx"],
    requires: { engine: "native", layout: "isolated" },
    bug: "#349: reanimated in a pnpm store, where its directory names worklets",
  },
  {
    id: "preset-banner",
    output: true,
    bug: "#5: the engine banner does not name the presets it applies",
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

/** Whether `probe` can observe its defect in `run`, a full assignment of every axis. */
export function applies(probe, run) {
  return Object.entries(probe.requires ?? {}).every(([axis, value]) =>
    (Array.isArray(value) ? value : [value]).includes(run[axis]),
  );
}

/**
 * The probes that can observe their defect in one run of a cell: `requires` is judged on
 * the cell's install axes and the run's runtime axes together. (Judged on the run alone,
 * every probe that requires an install axis would be n/a everywhere, silently.)
 */
export function activeProbes(probes, cell, run) {
  const { runs: _runs, ...install } = cell;
  return probes.filter(
    (probe) => !(run.excludes ?? []).includes(probe.id) && applies(probe, { ...install, ...run }),
  );
}

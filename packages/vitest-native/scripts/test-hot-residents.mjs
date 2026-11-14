// node scripts/test-hot-residents.mjs [--mutations]
//
// The resident-state audit. A hot worker keeps state from one file to the next; every
// piece of it must be either reset to what per-file isolation gives, or a declared,
// accepted carry-over (tests-native/hot-residents.json). Two checks:
//
// - Per resident: each probe pair (tests-native/hot-residents/) runs under per-file
//   isolation, the hot runtime and hot with freshRuntime, on one worker in name order.
//   The pair's second file records what it sees. Hot and fresh must see what isolation
//   sees, or exactly the value an allowlist entry documents.
// - Inventory: under hot, a setup file records every global, console property and
//   CommonJS module that crossed a file boundary as the same object. Each must be a
//   declared resident: RESIDENT_GLOBALS, a resident package, or hot-residents.json's list.
//
// --mutations also proves the probes can see what they claim to: each state-manifest
// entry's restore and verify are switched off in turn (VITEST_NATIVE_HOT_STATE_MUTATION
// `<id>:unverified`), and the audit must then fail naming that entry's probe. A pinned,
// undeclared global must fail the inventory.
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import { createRequire } from "node:module";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { isDeepStrictEqual } from "node:util";
import { REACT_NATIVE_PATH } from "../src/native/match.mjs";
import { RUNTIME_RESIDENT_PATH, TEST_RUNTIME_RESIDENT_PATH } from "../src/native/ownership.mjs";
import { RESIDENT_GLOBALS } from "../src/native/resident-globals.mjs";
import { HOT_STATE_MANIFEST_ENTRIES } from "../src/native/state-manifest.mjs";

const packageRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
export const DECLARATIONS = path.join(packageRoot, "tests-native", "hot-residents.json");
export const MODES = ["isolation", "hot", "fresh"];

/** The package a CommonJS module file belongs to, by its last node_modules segment. */
export function packageOf(file) {
  const parts = file.replace(/\\/g, "/").split("/node_modules/");
  if (parts.length < 2) return null;
  const segments = parts.at(-1).split("/");
  return segments[0].startsWith("@") ? `${segments[0]}/${segments[1]}` : segments[0];
}

const residentKind = (name) => {
  const file = `/node_modules/${name}/`;
  if (REACT_NATIVE_PATH.test(file)) return "react-native";
  if (RUNTIME_RESIDENT_PATH.test(file)) return "runtime";
  if (TEST_RUNTIME_RESIDENT_PATH.test(file)) return "test-runtime";
  return null;
};

const show = (value) => (value === undefined ? "nothing" : JSON.stringify(value));

/**
 * Every way the runs disagree with the declarations, as one message each. `observed` is
 * `{ isolation, hot, fresh }`, each a Map from probe to value; `inventory` is
 * `{ hot, fresh }`, each a list of `{ file, kind, name }` records.
 */
export function audit({ declared, observed, inventory, distDir }) {
  const failures = [];
  for (const probe of Object.keys(declared.probes)) {
    const isolated = observed.isolation.get(probe);
    if (isolated === undefined) {
      failures.push(`probe ${probe} recorded nothing under per-file isolation`);
      continue;
    }
    const entry = declared.carryOver[probe];
    for (const mode of ["hot", "fresh"]) {
      const seen = observed[mode].get(probe);
      const allowed = entry && entry[mode] !== "reset" ? entry[mode] : undefined;
      if (allowed === undefined) {
        if (isDeepStrictEqual(seen, isolated)) continue;
        failures.push(
          `resident ${probe}: under ${mode} the probe saw ${show(seen)}, per-file isolation ` +
            `gives ${show(isolated)}, and it is not in the known-differences allowlist ` +
            `(tests-native/hot-residents.json carryOver)`,
        );
      } else if (isDeepStrictEqual(seen, allowed)) {
        continue;
      } else if (isDeepStrictEqual(seen, isolated)) {
        failures.push(
          `allowlist stale: ${probe} no longer carries over under ${mode} (it sees what ` +
            `per-file isolation gives, ${show(isolated)}): remove its ${mode} entry` +
            (entry.doc ? " and the doc line" : ""),
        );
      } else {
        failures.push(
          `resident ${probe}: under ${mode} the probe saw ${show(seen)}, but the allowlist ` +
            `documents ${show(allowed)} (per-file isolation gives ${show(isolated)})`,
        );
      }
    }
  }

  const globals = new Set([
    ...Object.values(RESIDENT_GLOBALS).map(String),
    ...declared.inventory.globals,
  ]);
  const consoleKeys = new Set(declared.inventory.console);
  for (const mode of ["hot", "fresh"]) {
    const reported = new Set();
    for (const { file, kind, name } of inventory[mode]) {
      let resident = name;
      let problem = null;
      if (kind === "global") {
        if (!globals.has(name)) problem = "not in RESIDENT_GLOBALS or hot-residents.json";
      } else if (kind === "console") {
        if (!consoleKeys.has(name)) problem = "not in hot-residents.json";
      } else {
        const pkg = packageOf(name);
        const ownBuild = pkg === null && path.resolve(name).startsWith(distDir + path.sep);
        resident = pkg ?? (ownBuild ? "vitest-native" : name);
        const kindOf = ownBuild ? "test-runtime" : pkg && residentKind(pkg);
        if (!kindOf) problem = "not a resident package";
        else if (mode === "fresh" && kindOf === "runtime") {
          problem = "freshRuntime loads it again for every file";
        }
      }
      const key = `${kind} ${resident}`;
      if (problem === null || reported.has(key)) continue;
      reported.add(key);
      failures.push(
        `unlisted resident: under ${mode} the worker kept ${kind} ${resident} after ${file}, ` +
          `${problem}: declare it with a probe, or reset it`,
      );
    }
  }
  return failures;
}

/** The refusal a resident health check gives instead of running a file, if any. */
export function refusal(output) {
  return output.match(/this worker cannot run this file: [^\n]*?\(([a-z][\w.-]*)\)/)?.[1];
}

function runGroup(mode, group, env = {}) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), `vn-residents-${mode}-`));
  const require = createRequire(path.join(packageRoot, "package.json"));
  const vitest = path.join(path.dirname(require.resolve("vitest/package.json")), "vitest.mjs");
  const config = path.join("tests-native", "vitest.hot-residents.config.mts");
  const result = spawnSync(process.execPath, [vitest, "run", "--config", config, "--mode", mode], {
    cwd: packageRoot,
    encoding: "utf8",
    env: {
      ...process.env,
      ...env,
      FORCE_COLOR: "0",
      VN_RESIDENT_AUDIT_DIR: dir,
      VN_RESIDENT_AUDIT_GROUP: group,
    },
  });
  if (result.error) throw result.error;
  const read = (name) => {
    const file = path.join(dir, name);
    return fs.existsSync(file)
      ? fs.readFileSync(file, "utf8").trim().split("\n").filter(Boolean).map(JSON.parse)
      : [];
  };
  const run = {
    status: result.status,
    output: `${result.stdout ?? ""}${result.stderr ?? ""}`,
    observations: read("observations.jsonl"),
    inventory: read("inventory.jsonl"),
  };
  fs.rmSync(dir, { recursive: true, force: true });
  return run;
}

/** Runs every probe group in every mode and returns what `audit` reads. */
function collect(declared, { mutation = {}, modes = MODES, base } = {}) {
  const observed = base
    ? { ...base.observed }
    : Object.fromEntries(MODES.map((mode) => [mode, new Map()]));
  const inventory = base ? { ...base.inventory } : { hot: [], fresh: [] };
  const groups = [...new Set(Object.values(declared.probes).map((probe) => probe.group))];
  for (const mode of modes) {
    observed[mode] = new Map();
    if (mode !== "isolation") inventory[mode] = [];
    for (const group of groups) {
      const probes = Object.keys(declared.probes).filter(
        (probe) => declared.probes[probe].group === group,
      );
      const run = runGroup(mode, group, mode === "isolation" ? {} : mutation);
      for (const { probe, value } of run.observations) observed[mode].set(probe, value);
      if (mode !== "isolation") inventory[mode].push(...run.inventory);
      if (run.status === 0) continue;
      // A solo pair's second file may be refused by a resident health check: that refusal
      // is what the probe observes.
      const refused = refusal(run.output);
      const [probe] = probes;
      if (refused && probes.length === 1 && !observed[mode].has(probe)) {
        observed[mode].set(probe, { refusedFor: refused });
        continue;
      }
      throw new Error(
        `the ${group} probes failed under ${mode}${
          Object.keys(mutation).length ? ` (${JSON.stringify(mutation)})` : ""
        }:\n${run.output.slice(-4000)}`,
      );
    }
  }
  return { observed, inventory };
}

// The registry loads React Native again for every file, so these restorers are
// redundant there; their mutation legs run without it, on the resident React Native path
// they exist for (as test:native:hot:state-manifest does).
const REDUNDANT_UNDER_REGISTRY = new Set([
  "react-native.dimensions",
  "react-native.appearance",
  "react-native.event-listeners",
]);

function main() {
  const declared = JSON.parse(fs.readFileSync(DECLARATIONS, "utf8"));
  const distDir = path.join(packageRoot, "dist");
  const baseline = collect(declared);
  const failures = audit({ declared, ...baseline, distDir });
  if (failures.length > 0) {
    console.error(`[vitest-native] resident-state audit failed:\n- ${failures.join("\n- ")}`);
    process.exit(1);
  }
  for (const probe of Object.keys(declared.probes)) {
    const entry = declared.carryOver[probe];
    const how = entry ? `carries over (${entry.doc ? "documented" : `#${entry.issue}`})` : "reset";
    console.log(`[vitest-native] resident ${probe}: ${how}`);
  }
  console.log(
    `[vitest-native] resident-state audit passed: ${Object.keys(declared.probes).length} probes, ` +
      `${baseline.inventory.hot.length} kept items, all declared`,
  );
  if (!process.argv.includes("--mutations")) return;

  const manifestProbes = Object.entries(declared.probes).filter(([, { resident }]) =>
    HOT_STATE_MANIFEST_ENTRIES.includes(resident),
  );
  for (const [probe, { resident }] of manifestProbes) {
    const mutated = collect(declared, {
      base: baseline,
      modes: ["hot"],
      mutation: {
        VITEST_NATIVE_HOT_STATE_MUTATION: `${resident}:unverified`,
        ...(REDUNDANT_UNDER_REGISTRY.has(resident) ? { VITEST_NATIVE_NO_REGISTRY: "1" } : {}),
      },
    });
    const caught = audit({ declared, ...mutated, distDir }).filter((failure) =>
      failure.startsWith(`resident ${probe}:`),
    );
    if (caught.length === 0) {
      throw new Error(
        `mutation ${resident}: with its restore and verify off, probe ${probe} saw no ` +
          `difference from per-file isolation`,
      );
    }
    console.log(`[vitest-native] mutation caught by its probe: ${resident}`);
  }
  const pinned = collect(declared, {
    base: baseline,
    modes: ["hot"],
    mutation: { VN_RESIDENT_AUDIT_PIN_UNLISTED: "1" },
  });
  if (!audit({ declared, ...pinned, distDir }).some((f) => f.includes("global __VN_UNLISTED__"))) {
    throw new Error("an undeclared preserved global did not fail the inventory");
  }
  console.log("[vitest-native] mutation caught by the inventory: an undeclared kept global");
  console.log(
    `[vitest-native] resident-state mutations passed: ${manifestProbes.length} restores, 1 inventory`,
  );
}

if (process.argv[1] === fileURLToPath(import.meta.url)) main();

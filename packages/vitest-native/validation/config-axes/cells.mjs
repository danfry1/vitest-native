// The cells of the configuration-axis matrix, from axes.json.
//
// A cell is one CI job: one value of each INSTALL axis (Vitest, RNTL, layout), and the
// RUNTIME combinations (engine, globals, hot, jestCompat) run against that install.
//
// Scopes:
//   pairwise  a two-way cover of the INSTALL axes (every pair of Vitest, RNTL and layout
//             values is some job), each job running EVERY allowed runtime combination.
//             Pull requests. 6 jobs, against 12 for the cartesian.
//   full      every install combination × every runtime combination. Pushes to main,
//             the weekly schedule, manual runs, and pull requests that change the matrix
//             itself (the same rule as .github/scripts/rn-matrix.mjs).
//
// Pairwise rather than cartesian on pull requests because an install is the expensive
// part of a job (a registry install of React Native, Vitest and RNTL), while a runtime
// combination is one more Vitest process over the same node_modules — measured at 1–3 s
// warm, 7–11 s for the first. So the install axes are covered two-way and the runtime
// axes in full: every runtime interaction is seen on six installs, and every defect this
// matrix was built from sat on at most two axes (globals:false; RNTL 12/13 × native;
// Vitest 4 × hot; an isolated layout × a preset switched off). Three-way interactions of
// install axes are the full scope's job.
//
//   node validation/config-axes/cells.mjs <event> [base-sha head-sha]
//   writes `matrix=<json>` and `scope=full|pairwise` to $GITHUB_OUTPUT (and stdout).
import { execFileSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));

/** Paths whose change runs the full scope on a pull request (repository-relative). */
export const SELF = [
  "packages/vitest-native/validation/config-axes/",
  ".github/workflows/config-axis-matrix.yml",
];

export function readAxes() {
  return JSON.parse(fs.readFileSync(path.join(here, "axes.json"), "utf8"));
}

/** Every assignment of the given axes ({axis: values[]}), in a stable order. */
export function cartesian(axes) {
  let rows = [{}];
  for (const [axis, values] of Object.entries(axes)) {
    rows = rows.flatMap((row) => values.map((value) => ({ ...row, [axis]: value })));
  }
  return rows;
}

/**
 * Whether `row` violates no constraint. A constraint whose axes the row does not assign
 * yet cannot be violated by it.
 */
export function allowed(row, constraints = []) {
  return constraints.every(({ if: when, then }) => {
    const triggered = Object.entries(when).every(([axis, value]) => row[axis] === value);
    if (!triggered) return true;
    return Object.entries(then).every(([axis, value]) => !(axis in row) || row[axis] === value);
  });
}

const pairKey = (a, x, b, y) => `${a}=${x}&${b}=${y}`;

/** The value pairs of `row`, for axes in `axisNames` (in that order). */
function pairsOf(row, axisNames) {
  const keys = [];
  for (let i = 0; i < axisNames.length; i++) {
    for (let j = i + 1; j < axisNames.length; j++) {
      const [a, b] = [axisNames[i], axisNames[j]];
      keys.push(pairKey(a, row[a], b, row[b]));
    }
  }
  return keys;
}

/**
 * A greedy two-way cover: repeatedly take the candidate that covers the most pairs not
 * yet covered, first in candidate order on a tie, until every pair some candidate has
 * is covered. Deterministic, so a pull request's cells do not change between pushes.
 * Pairs no allowed candidate contains (hot=on with engine=mock) are not required.
 */
export function pairwiseCover(candidates, axisNames) {
  const uncovered = new Set(candidates.flatMap((row) => pairsOf(row, axisNames)));
  const chosen = [];
  while (uncovered.size > 0) {
    let best = null;
    let bestGain = 0;
    for (const row of candidates) {
      const gain = pairsOf(row, axisNames).filter((key) => uncovered.has(key)).length;
      if (gain > bestGain) [best, bestGain] = [row, gain];
    }
    chosen.push(best);
    for (const key of pairsOf(best, axisNames)) uncovered.delete(key);
  }
  return chosen;
}

const installKey = (row, installAxes) =>
  installAxes.map((axis) => `${axis}=${row[axis]}`).join(",");

/** Group full rows into cells: one per install combination, runs in row order. */
function groupCells(rows, def) {
  const installAxes = Object.keys(def.install);
  const runtimeAxes = Object.keys(def.runtime);
  const cells = new Map();
  for (const row of rows) {
    const key = installKey(row, installAxes);
    if (!cells.has(key)) {
      const cell = Object.fromEntries(installAxes.map((axis) => [axis, row[axis]]));
      cells.set(key, { ...cell, runs: [] });
    }
    cells.get(key).runs.push(Object.fromEntries(runtimeAxes.map((axis) => [axis, row[axis]])));
  }
  return [...cells.values()];
}

export function cellsFor(def, scope) {
  const constraints = def.constraints ?? [];
  const runtime = cartesian(def.runtime).filter((row) => allowed(row, constraints));
  const allInstalls = cartesian(def.install).filter((row) => allowed(row, constraints));
  const installs =
    scope === "full" ? allInstalls : pairwiseCover(allInstalls, Object.keys(def.install));
  const rows = installs
    .flatMap((install) => runtime.map((run) => ({ ...install, ...run })))
    .filter((row) => allowed(row, constraints));
  return groupCells(rows, def);
}

/** A short, stable job name: `vitest 5 · RNTL 14 · isolated`. */
export function cellName(cell) {
  return `vitest ${cell.vitest} · RNTL ${cell.rntl} · ${cell.layout}`;
}

export function scopeFor(event, changedFiles) {
  if (event !== "pull_request") return "full";
  return changedFiles.some((file) => SELF.some((prefix) => file.startsWith(prefix)))
    ? "full"
    : "pairwise";
}

if (process.argv[1] && import.meta.url === new URL(`file://${process.argv[1]}`).href) {
  const [event, base, head] = process.argv.slice(2);
  const changed =
    event === "pull_request" && base && head
      ? execFileSync("git", ["diff", "--name-only", base, head], { encoding: "utf8" })
          .split("\n")
          .filter(Boolean)
      : [];
  const scope = scopeFor(event, changed);
  const include = cellsFor(readAxes(), scope).map((cell) => ({
    name: cellName(cell),
    cell: JSON.stringify(cell),
  }));
  const lines = [`matrix=${JSON.stringify({ include })}`, `scope=${scope}`];
  console.log(lines.join("\n"));
  if (process.env.GITHUB_OUTPUT)
    fs.appendFileSync(process.env.GITHUB_OUTPUT, `${lines.join("\n")}\n`);
}

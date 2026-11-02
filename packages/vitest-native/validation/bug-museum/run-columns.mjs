// Measures every column of STATUS.md, one build and one run at a time:
//
//   node validation/bug-museum/run-columns.mjs --results <dir> [--main <ref>]
//        [--cache <dir>] [--max-load <n>] [--only id,id]
//
//   main     every exhibit against <ref> (default origin/main)
//   control  run.mjs --control on the same build, for exhibits with a `control`
//   fix      each exhibit against its `fixRef`
//   buggy    each exhibit against its `buggyRef`
//   preFix   each exhibit against its `preFixRef`
//
// Each column's verdicts go to <results>/<column>.json; columns.json (committed beside
// this script) records the SHA every ref resolved to, which status.mjs checks every
// verdict against. --max-load waits before each run until the 1-minute load is below n.
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { buildRef, resolveRef } from "./build-ref.mjs";

const here = path.dirname(fileURLToPath(import.meta.url));
const argument = (name) => {
  const index = process.argv.indexOf(`--${name}`);
  return index === -1 ? undefined : process.argv[index + 1];
};
const results = argument("results");
if (!results) throw new Error("--results <dir> is required");
fs.mkdirSync(results, { recursive: true });
const cache = argument("cache") && path.resolve(argument("cache"));
const maxLoad = Number(argument("max-load") ?? Infinity);
const only = argument("only")?.split(",");
const mainRef = argument("main") ?? "origin/main";

const exhibits = JSON.parse(
  fs.readFileSync(path.join(here, "exhibits.json"), "utf8"),
).exhibits.filter((e) => !only || only.includes(e.id));

function waitForLoad() {
  const sleeper = new Int32Array(new SharedArrayBuffer(4));
  for (let i = 0; i < 120 && os.loadavg()[0] >= maxLoad; i++) Atomics.wait(sleeper, 0, 0, 10_000);
}

function run(column, build, ids, extra = []) {
  if (ids.length === 0) return;
  waitForLoad();
  const result = spawnSync(
    "nice",
    [
      "-n",
      "10",
      process.execPath,
      path.join(here, "run.mjs"),
      "--only",
      ids.join(","),
      "--build",
      build,
      "--json",
      path.join(results, `${column}.json`),
      "--allow-na",
      ...extra,
    ],
    { stdio: "inherit" },
  );
  if (result.error) throw result.error;
}

// A filtered run (--only) updates the refs it measured and keeps the others.
const columnsFile = path.join(here, "columns.json");
const previous = fs.existsSync(columnsFile) ? JSON.parse(fs.readFileSync(columnsFile, "utf8")) : {};
const columns = { main: { ref: mainRef, sha: resolveRef(mainRef) }, refs: { ...previous.refs } };
const mainBuild = buildRef(mainRef, cache);
console.log(`\n== main (${mainRef} = ${columns.main.sha})`);
run(
  "main",
  mainBuild,
  exhibits.map((e) => e.id),
);
console.log("\n== control");
run(
  "control",
  mainBuild,
  exhibits.filter((e) => e.control).map((e) => e.id),
  ["--control"],
);
for (const [column, field] of [
  ["fix", "fixRef"],
  ["buggy", "buggyRef"],
  ["preFix", "preFixRef"],
]) {
  const byRef = new Map();
  for (const e of exhibits)
    if (e[field]) byRef.set(e[field], [...(byRef.get(e[field]) ?? []), e.id]);
  for (const [ref, ids] of byRef) {
    columns.refs[ref] = resolveRef(ref);
    console.log(`\n== ${column}: ${ref} = ${columns.refs[ref]}`);
    run(column, buildRef(ref, cache), ids);
  }
}
fs.writeFileSync(columnsFile, `${JSON.stringify(columns, null, 2)}\n`);
console.log(`\nwrote columns.json; verdicts in ${results}`);

// Differential cross-check: run the crosscheck corpus under BOTH engines and fail
// if any probe's observable result differs. This is the trust mechanism for the
// mock engine — it proves, on every commit (and every RN version in CI), that the
// pure-JS mock behaves like real React Native for the covered behaviors.
//
// Usage: `bun run crosscheck` (or `node scripts/crosscheck.mjs`).
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const config = path.join(root, "crosscheck", "vitest.config.mts");
const outDir = path.join(root, "crosscheck", ".out");
const vitestBin = path.join(root, "node_modules", ".bin", "vitest");
fs.mkdirSync(outDir, { recursive: true });

function runEngine(engine) {
  const out = path.join(outDir, `${engine}.json`);
  fs.rmSync(out, { force: true });
  console.log(`\n── cross-check: ${engine} engine ──`);
  const res = spawnSync(vitestBin, ["run", "--config", config], {
    cwd: root,
    stdio: "inherit",
    env: { ...process.env, CROSSCHECK_ENGINE: engine, CROSSCHECK_OUT: out },
  });
  let data = {};
  try {
    data = JSON.parse(fs.readFileSync(out, "utf8"));
  } catch {
    console.error(`✗ ${engine}: no results produced (the suite likely failed above)`);
  }
  return { data, ok: res.status === 0 };
}

const native = runEngine("native");
const mock = runEngine("mock");

const names = [...new Set([...Object.keys(native.data), ...Object.keys(mock.data)])].sort();
const failures = [];
for (const name of names) {
  const inNative = name in native.data;
  const inMock = name in mock.data;
  if (!inNative) {
    failures.push({ name, reason: "missing under native (errored or not run)" });
  } else if (!inMock) {
    failures.push({ name, reason: "missing under mock (errored or not run)" });
  } else if (JSON.stringify(native.data[name]) !== JSON.stringify(mock.data[name])) {
    failures.push({ name, reason: "diverged", native: native.data[name], mock: mock.data[name] });
  }
}

console.log("\n── cross-check result ──");
const matched = names.length - failures.length;
console.log(`${matched}/${names.length} probes match between mock and real React Native.`);

if (failures.length > 0) {
  console.error(`\n✗ ${failures.length} divergence(s) — the mock does not match real RN:\n`);
  for (const f of failures) {
    if (f.reason === "diverged") {
      console.error(`  • ${f.name}`);
      console.error(`      native: ${JSON.stringify(f.native)}`);
      console.error(`      mock:   ${JSON.stringify(f.mock)}`);
    } else {
      console.error(`  • ${f.name} — ${f.reason}`);
    }
  }
  process.exit(1);
}

if (!native.ok || !mock.ok) {
  console.error("\n✗ a suite exited non-zero even though probes matched — failing.");
  process.exit(1);
}

console.log("✓ mock engine matches real React Native across the corpus.");

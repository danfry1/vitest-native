// Differential cross-check: run the crosscheck corpus under BOTH engines and fail
// if any probe's observable result differs. This is the trust mechanism for the
// mock engine — it proves, on every commit (and every RN version in CI), that the
// pure-JS mock behaves like real React Native for the covered behaviors.
//
// Usage: `bun run crosscheck` (or `node scripts/crosscheck.mjs`).
//
// It also writes an ephemeral combined report to crosscheck/.out/report.json
// (RN version + per-probe parity) that `scripts/fidelity-report.mjs` renders
// into the committed badge and the published fidelity page. The .out directory
// is gitignored, so running the gate itself never produces a committed diff.
import { spawnSync } from "node:child_process";
import { createRequire } from "node:module";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const config = path.join(root, "crosscheck", "vitest.config.mts");
const outDir = path.join(root, "crosscheck", ".out");
const vitestBin = path.join(root, "node_modules", ".bin", "vitest");
fs.mkdirSync(outDir, { recursive: true });

function resolveReactNativeVersion() {
  try {
    const req = createRequire(path.join(root, "package.json"));
    return req("react-native/package.json").version;
  } catch {
    return null;
  }
}

function resolveVitestVersion() {
  try {
    const req = createRequire(path.join(root, "package.json"));
    return req("vitest/package.json").version;
  } catch {
    return null;
  }
}

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

// Emit a combined, machine-readable report for the fidelity pipeline. Ephemeral
// (.out is gitignored); scripts/fidelity-report.mjs renders the committed
// artifacts from it. Per-probe values are omitted here to keep the published
// surface stable — only each probe's name and match status are reported.
const failureByName = new Map(failures.map((f) => [f.name, f]));
const report = {
  reactNativeVersion: resolveReactNativeVersion(),
  vitestVersion: resolveVitestVersion(),
  generatedAt: new Date().toISOString(),
  summary: { total: names.length, matching: matched },
  probes: names.map((name) => {
    const failure = failureByName.get(name);
    return { name, match: !failure, ...(failure ? { reason: failure.reason } : {}) };
  }),
};
fs.writeFileSync(path.join(outDir, "report.json"), `${JSON.stringify(report, null, 2)}\n`);

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

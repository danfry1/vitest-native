// Three-way fidelity report: jest (Meta's mocks) vs vitest-native `mock` vs
// vitest-native `native` (real RN = the oracle). Highlights every probe where a
// mock-based runner diverges from real RN — i.e. where it would false-pass.
import fs from "node:fs";
import path from "node:path";

const dir = path.dirname(new URL(import.meta.url).pathname);
const load = (engine) => {
  try {
    return JSON.parse(fs.readFileSync(path.join(dir, `results.${engine}.json`), "utf8"));
  } catch {
    return null;
  }
};

const jest = load("jest");
const mock = load("mock");
const native = load("native");
if (!native) {
  console.error("Missing results.native.json — run the native capture first.");
  process.exit(1);
}

const keys = Object.keys(native);
let jestDiverge = 0;
let mockDiverge = 0;
const s = (v) => JSON.stringify(v);

for (const k of keys) {
  const n = s(native[k]);
  const j = jest ? s(jest[k]) : "(n/a)";
  const m = mock ? s(mock[k]) : "(n/a)";
  const jOff = jest && j !== n;
  const mOff = mock && m !== n;
  if (jOff) jestDiverge++;
  if (mOff) mockDiverge++;
  console.log(`\n• ${k}`);
  console.log(`    native (real RN): ${n}`);
  console.log(`    jest (RN preset): ${j}${jOff ? "   <-- DIVERGES (false confidence)" : "   = matches"}`);
  console.log(`    vitest-native mock: ${m}${mOff ? "   <-- DIVERGES" : "   = matches"}`);
}

console.log(
  `\nFidelity: jest diverges from real RN on ${jestDiverge}/${keys.length} probes; ` +
    `vitest-native mock on ${mockDiverge}/${keys.length}. ` +
    `native matches real RN by construction (it IS real RN).`,
);

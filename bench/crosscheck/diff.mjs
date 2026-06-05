// Diffs the two engines' captured probe results. Any divergence is a place the
// mock and real RN disagree — a candidate mock-fidelity bug (or a native
// boundary gap). This is the cross-check tool in miniature.
import fs from "node:fs";
import path from "node:path";

const dir = path.dirname(new URL(import.meta.url).pathname);
const load = (engine) => JSON.parse(fs.readFileSync(path.join(dir, `results.${engine}.json`), "utf8"));
const mock = load("mock");
const native = load("native");

const keys = [...new Set([...Object.keys(mock), ...Object.keys(native)])];
let diverge = 0;
for (const k of keys) {
  const m = JSON.stringify(mock[k]?.ok ? mock[k].value : `THREW: ${mock[k]?.error}`);
  const n = JSON.stringify(native[k]?.ok ? native[k].value : `THREW: ${native[k]?.error}`);
  const same = m === n;
  if (!same) diverge++;
  console.log(`${same ? "✓ agree  " : "✗ DIVERGE"}  ${k}`);
  if (!same) {
    console.log(`            mock:   ${m}`);
    console.log(`            native: ${n}`);
  }
}
console.log(`\n${diverge} divergence(s) across ${keys.length} probes (native = real RN ground truth)`);

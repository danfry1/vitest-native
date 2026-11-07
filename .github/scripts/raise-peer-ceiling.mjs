// For a canary only: let the startup check accept a peer's next major, in this job's
// checkout, so the canary tests what a new major would do rather than being refused with
// UNSUPPORTED_PEER (src/peer-requirements.ts, which refuses unproven majors by design).
// Never committed: the release raises a ceiling only once the full gate passes on it
// (docs/upstream-policy.md).
//
//   node .github/scripts/raise-peer-ceiling.mjs <package> <version>
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

export const FILE = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "../../packages/vitest-native/src/peer-requirements.ts",
);

/** `source` with `name`'s maximumMajor raised to admit `version`'s major, if needed. */
export function raiseCeiling(source, name, version) {
  const major = Number(version.split(".")[0]);
  const entry = new RegExp(`(\\{\\s*name:\\s*"${name.replace(/[.*+?^${}()|[\]\\/]/g, "\\$&")}",[^}]*?maximumMajor:\\s*)(\\d+)`);
  const match = entry.exec(source);
  if (!match) throw new Error(`no maximumMajor for ${name} in peer-requirements.ts`);
  if (Number(match[2]) > major) return source;
  return source.replace(entry, `$1${major + 1}`);
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const [name, version] = process.argv.slice(2);
  const before = fs.readFileSync(FILE, "utf8");
  const after = raiseCeiling(before, name, version);
  fs.writeFileSync(FILE, after);
  console.log(after === before ? `${name}: ${version} is already inside the range` : `${name}: ceiling raised for ${version} (this job only)`);
}

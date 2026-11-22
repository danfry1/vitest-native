/**
 * Preloaded (`node --import`) into a script that is expected to stop on its arguments: any
 * process it starts or file it writes throws instead, so a script that no longer stops
 * fails without doing its work (a cross-check run, a bake-off, a benchmark).
 */
import childProcess from "node:child_process";
import fs from "node:fs";
import { syncBuiltinESMExports } from "node:module";

const refuse = (name) => () => {
  throw new Error(`no-work: ${name} was called before the arguments stopped the script`);
};
for (const name of ["spawn", "spawnSync", "exec", "execSync", "execFile", "execFileSync", "fork"]) {
  childProcess[name] = refuse(`child_process.${name}`);
}
for (const name of [
  "writeFileSync",
  "appendFileSync",
  "mkdirSync",
  "mkdtempSync",
  "rmSync",
  "cpSync",
  "copyFileSync",
  "renameSync",
  "symlinkSync",
]) {
  fs[name] = refuse(`fs.${name}`);
}
syncBuiltinESMExports();

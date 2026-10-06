// The Vitest × React Native matrix for native-rn-matrix.yml, from .github/rn-matrix.json
// (also the source scripts/fidelity-*.mjs derive the published range from).
//
// Pull requests run the ends of the React Native range in every Vitest column: the
// oldest and newest supported React Native, where version drift shows first. The full
// matrix runs on every push to main, on the weekly schedule and on manual runs, so
// every cell is still exercised before a release; a pull request that changes the
// matrix definition itself runs the full matrix too. Before this, all 16 cells ran on
// every pull request (about 16 job-minutes each), Dependabot's included.
//
//   node .github/scripts/rn-matrix.mjs <event> [base-sha head-sha]
//   writes `matrix=<json>` and `scope=full|ends` to $GITHUB_OUTPUT (and stdout).
import { execFileSync } from "node:child_process";
import fs from "node:fs";

const DEFINITION = ".github/rn-matrix.json";
const SELF = [DEFINITION, ".github/scripts/rn-matrix.mjs", ".github/workflows/native-rn-matrix.yml"];

export function matrixFor(definition, scope) {
  if (scope === "full") return definition;
  const ends = new Set([definition.rn[0], definition.rn.at(-1)]);
  return {
    rn: definition.rn.filter((rn) => ends.has(rn)),
    vitest: definition.vitest,
    include: definition.include.filter((cell) => ends.has(cell.rn)),
  };
}

export function scopeFor(event, changedFiles) {
  if (event !== "pull_request") return "full";
  return changedFiles.some((file) => SELF.includes(file)) ? "full" : "ends";
}

if (process.argv[1] && import.meta.url === new URL(`file://${process.argv[1]}`).href) {
  const [event, base, head] = process.argv.slice(2);
  const changed =
    event === "pull_request" && base && head
      ? execFileSync("git", ["diff", "--name-only", base, head], { encoding: "utf8" })
          .split("\n")
          .filter(Boolean)
      : [];
  const definition = JSON.parse(fs.readFileSync(DEFINITION, "utf8"));
  const scope = scopeFor(event, changed);
  const lines = [`matrix=${JSON.stringify(matrixFor(definition, scope))}`, `scope=${scope}`];
  console.log(lines.join("\n"));
  if (process.env.GITHUB_OUTPUT) fs.appendFileSync(process.env.GITHUB_OUTPUT, `${lines.join("\n")}\n`);
}

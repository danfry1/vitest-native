#!/usr/bin/env node
/**
 * vitest-native CLI: `init` (write a ready config), `doctor` (diagnose the
 * environment), `migrate` (analyze a Jest config and report the mapping),
 * `compare` (run the suite under Jest and under Vitest and list the differences).
 * Deliberately vitest-free at module load — it runs via npx outside any test
 * process.
 */
import path from "node:path";
import fs from "node:fs";
import { runDoctor } from "./doctor.js";
import { runInit } from "./init.js";
import { analyzeJestConfig, renderMigrationReport } from "./migrate.js";
import { COMPARE_VALUED_FLAGS, parseCompareArgs, runCompare } from "./compare-run.js";

const USAGE = `vitest-native — test React Native with Vitest

Usage:
  vitest-native init [--jest-compat] [--force]   write a ready-to-run vitest config
  vitest-native doctor                           diagnose peers, engine, presets, RNTL/Node
  vitest-native migrate [--write] [--force]      analyze jest config → migration report
                                                 (--write also saves the suggested config)
  vitest-native compare                          run the suite under Jest and under Vitest,
                                                 list every test whose result differs
      --jest-args "<args>"    extra Jest arguments      --vitest-args "<args>"  extra Vitest arguments
      --vitest-config <file>  Vitest config to use      --jest-results <file>   read Jest's --json report
      --jest-root <dir>       where that report was made (detected when omitted)
      --json <file>           write a report to attach to an issue (no source code)
      --top <n>               groups and files to list (10)
      --timeout <seconds>     per runner (1800)         --show-output           stream both runners' output
      exits 0 when every Jest-passing test passes under Vitest and \`vitest run\` exits 0,
      1 when not, 2 when a runner could not run or the project changed, 130 when interrupted
Options:
  --root <dir>   project root (default: cwd)
  --help         this text

Docs: https://danfry1.github.io/vitest-native/`;

export function main(
  argv: string[],
  log: (line: string) => void = console.log,
): number | Promise<number> {
  const args = argv.filter((a) => a !== "--");
  // The value following --root (or another valued flag) is an argument, not the command.
  const command = args.find(
    (a, i) => !a.startsWith("-") && !COMPARE_VALUED_FLAGS.includes(args[i - 1]),
  );
  const has = (flag: string) => args.includes(flag);
  const rootIdx = args.indexOf("--root");
  const root = path.resolve(rootIdx !== -1 ? (args[rootIdx + 1] ?? ".") : ".");

  if (has("--help") || has("-h")) {
    log(USAGE);
    return 0;
  }
  if (!command) {
    log(USAGE);
    return 1;
  }
  if (!fs.existsSync(path.join(root, "package.json"))) {
    log(`✗ no package.json at ${root} — run from a project root or pass --root.`);
    return 1;
  }

  switch (command) {
    case "doctor": {
      const result = runDoctor(root);
      for (const line of result.lines) log(line);
      return result.ok ? 0 : 1;
    }
    case "init": {
      const result = runInit(root, { jestCompat: has("--jest-compat"), force: has("--force") });
      for (const line of result.lines) log(line);
      return result.ok ? 0 : 1;
    }
    case "migrate": {
      const report = analyzeJestConfig(root);
      for (const line of renderMigrationReport(report)) log(line);
      if (report.ok && has("--write")) {
        const init = runInit(root, { force: has("--force") });
        if (!init.ok) {
          for (const line of init.lines) log(line);
          return 1;
        }
        const target = path.join(root, init.wrote as string);
        fs.writeFileSync(target, report.suggestedConfig);
        log(`✓ wrote ${init.wrote} from the analysis above.`);
      }
      return report.ok ? 0 : 1;
    }
    case "compare": {
      const parsed = parseCompareArgs(args.filter((_, i) => i !== args.indexOf(command)));
      if ("error" in parsed) {
        log(`✗ ${parsed.error}`);
        return 1;
      }
      return runCompare({ ...parsed, root, log });
    }
    default:
      log(`✗ unknown command '${command}'.`);
      log(USAGE);
      return 1;
  }
}

// Invoked as a bin (npx vitest-native / node dist/cli.mjs) — dispatch and
// exit. Tests import main() directly, where argv[1] is the test runner. The CLI
// ships as ESM only (dist/cli.mjs, the `bin`).
const entry = process.argv[1] ? path.basename(process.argv[1]) : "";
if (entry === "cli.mjs" || entry === "vitest-native") {
  const code = main(process.argv.slice(2));
  if (typeof code === "number") process.exit(code);
  else void code.then((c) => process.exit(c));
}

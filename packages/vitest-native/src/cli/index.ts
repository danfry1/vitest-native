#!/usr/bin/env node
/**
 * vitest-native CLI: `init` (write a ready config), `doctor` (diagnose the
 * environment), `migrate` (analyze a Jest config and report the mapping).
 * Deliberately vitest-free at module load — it runs via npx outside any test
 * process.
 */
import path from "node:path";
import fs from "node:fs";
import { runDoctor } from "./doctor.js";
import { runInit } from "./init.js";
import { analyzeJestConfig, renderMigrationReport } from "./migrate.js";

const USAGE = `vitest-native — test React Native with Vitest

Usage:
  vitest-native init [--jest-compat] [--force]   write a ready-to-run vitest config
  vitest-native doctor                           diagnose peers, engine, presets, RNTL/Node
  vitest-native migrate [--write]                analyze jest config → migration report
                                                 (--write also saves the suggested config)
Options:
  --root <dir>   project root (default: cwd)
  --help         this text

Docs: https://danfry1.github.io/vitest-native/`;

export function main(argv: string[], log: (line: string) => void = console.log): number {
  const args = argv.filter((a) => a !== "--");
  const command = args.find((a) => !a.startsWith("-"));
  const has = (flag: string) => args.includes(flag);
  const rootIdx = args.indexOf("--root");
  const root = path.resolve(rootIdx !== -1 ? (args[rootIdx + 1] ?? ".") : ".");

  if (!command || has("--help") || has("-h")) {
    log(USAGE);
    return command ? 0 : 1;
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
    default:
      log(`✗ unknown command '${command}'.`);
      log(USAGE);
      return 1;
  }
}

// Invoked as a bin (npx vitest-native / node dist/cli.mjs) — dispatch and
// exit. Tests import main() directly, where argv[1] is the test runner.
const entry = process.argv[1] ? path.basename(process.argv[1]) : "";
if (entry === "cli.mjs" || entry === "cli.cjs" || entry === "vitest-native") {
  process.exit(main(process.argv.slice(2)));
}

// How many React Native modules each test file runs, from the precompiled registry's own
// count (`ran()`, reset per file). Runs Vitest with the given config plus a setup file
// that records the count after each file, and prints the files and the total. Usable on
// any project configured with this package: it extends the config, it does not edit it.
//
//   node scripts/measure-rn-evaluations.mjs <vitest config> [extra vitest args…]
//   node scripts/measure-rn-evaluations.mjs tests-native/vitest.config.mts tests-native/rn-facade.test.tsx
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const [configArg, ...vitestArgs] = process.argv.slice(2);
if (!configArg) {
  console.error("usage: node scripts/measure-rn-evaluations.mjs <vitest config> [vitest args…]");
  process.exit(2);
}
const here = path.dirname(fileURLToPath(import.meta.url));
const config = path.resolve(configArg);
const setup = path.join(here, "support", "rn-evaluations.setup.mjs");
const out = path.join(fs.mkdtempSync(path.join(os.tmpdir(), "vn-rn-evaluations-")), "files.jsonl");
const wrapper = path.join(path.dirname(config), `.vitest.measure-rn-${process.pid}.config.mts`);
// The setup file joins the config's own: the top-level `test`, or each inline project.
fs.writeFileSync(
  wrapper,
  `import base from ${JSON.stringify(pathToFileURL(config).href)};
const add = (test = {}) => ({ ...test, setupFiles: [...[test.setupFiles ?? []].flat(), ${JSON.stringify(setup)}] });
const config = typeof base === "function" ? await base({ mode: "test", command: "serve" }) : base;
export default {
  ...config,
  test: {
    ...add(config.test),
    ...(Array.isArray(config.test?.projects)
      ? { projects: config.test.projects.map((p) => (typeof p === "object" ? { ...p, test: add(p.test) } : p)) }
      : {}),
  },
};
`,
);
let status;
try {
  status = spawnSync(
    process.execPath,
    [
      path.join(here, "../node_modules/vitest/vitest.mjs"),
      "run",
      "--config",
      wrapper,
      ...vitestArgs,
    ],
    {
      cwd: process.cwd(),
      stdio: "inherit",
      env: { ...process.env, VN_MEASURE_RN_EVALUATIONS: out },
    },
  ).status;
} finally {
  fs.rmSync(wrapper, { force: true });
}
const rows = fs.existsSync(out)
  ? fs
      .readFileSync(out, "utf8")
      .trim()
      .split("\n")
      .filter(Boolean)
      .map((line) => JSON.parse(line))
  : [];
for (const row of rows) console.log(`${String(row.ran).padStart(5)} / ${row.of}  ${row.file}`);
const total = rows.reduce((sum, row) => sum + row.ran, 0);
console.log(`React Native modules run: ${total} across ${rows.length} test file(s)`);
process.exit(status ?? 1);

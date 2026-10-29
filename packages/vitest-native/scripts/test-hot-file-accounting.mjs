// Every test file the hot runtime is given must come back with a result.
//
// A file that produced no result is invisible: no failed test, no file entry, and
// nothing in the JSON reporter, which carries no run-level errors. So this gate reads
// the JSON report and counts FILES, rather than trusting the exit code or a test count.
//
//   regression  A file that `jest.mock`s Appearance to null, then an ordinary file. The
//               second one used to vanish: the Appearance restore ran while the first
//               file's mock was still registered and threw before the file was
//               collected. Both files must be reported and pass.
//   guard       The first file breaks its task outside any test file (Vitest's per-file
//               spy restore throws). The second file shares that task and must still be
//               reported, as failed, with an error naming it. The run must fail.
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";

const packageRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const require = createRequire(path.join(packageRoot, "package.json"));
const vitestEntry = path.join(path.dirname(require.resolve("vitest/package.json")), "vitest.mjs");
const config = path.join("tests-native", "vitest.hot-file-accounting.config.mts");
const fixtures = path.join(packageRoot, "tests-native", "hot-file-accounting");
const outDir = fs.mkdtempSync(path.join(os.tmpdir(), "vn-hot-file-accounting-"));

function run(mode) {
  const report = path.join(outDir, `${mode}.json`);
  const result = spawnSync(
    process.execPath,
    [
      vitestEntry,
      "run",
      "--config",
      config,
      "--mode",
      mode,
      "--reporter=default",
      "--reporter=json",
      `--outputFile.json=${report}`,
    ],
    { cwd: packageRoot, encoding: "utf8", env: { ...process.env, FORCE_COLOR: "0" } },
  );
  if (result.error) throw result.error;
  const output = `${result.stdout ?? ""}${result.stderr ?? ""}`;
  if (!fs.existsSync(report)) throw new Error(`${mode}: no JSON report was written:\n${output}`);
  const json = JSON.parse(fs.readFileSync(report, "utf8"));
  const byFile = new Map(json.testResults.map((entry) => [path.basename(entry.name), entry]));
  const expected = fs.readdirSync(path.join(fixtures, mode)).filter((f) => f.endsWith(".test.ts"));
  const missing = expected.filter((file) => !byFile.has(file));
  if (missing.length > 0) {
    throw new Error(`${mode}: ${missing.join(", ")} produced no result at all:\n${output}`);
  }
  return { status: result.status, byFile, output };
}

try {
  const regression = run("regression");
  const failed = [...regression.byFile].filter(([, entry]) => entry.status !== "passed");
  if (regression.status !== 0 || failed.length > 0) {
    throw new Error(
      `regression: expected every file to pass, got exit ${regression.status} and ` +
        `${failed.map(([file]) => file).join(", ") || "no failed file"}:\n${regression.output}`,
    );
  }
  console.log("[vitest-native] file accounting: regression pair both reported and passing");

  const guard = run("guard");
  // Negative control: the fixture must still break its task, or the guard is untested.
  if (!guard.output.includes("Cannot redefine property")) {
    throw new Error(`guard: the fixture no longer breaks its task:\n${guard.output}`);
  }
  const innocent = guard.byFile.get("02-innocent.test.ts");
  if (
    guard.status === 0 ||
    innocent.status !== "failed" ||
    !innocent.message.includes("02-innocent.test.ts") ||
    !innocent.message.includes("never ran")
  ) {
    throw new Error(
      `guard: expected a failed run and 02-innocent reported failed by name, got exit ` +
        `${guard.status}, status '${innocent.status}', message '${innocent.message}'`,
    );
  }
  console.log("[vitest-native] file accounting: a file its task never reached is reported failed");
} finally {
  fs.rmSync(outDir, { recursive: true, force: true });
}

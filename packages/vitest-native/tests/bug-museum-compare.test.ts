// The museum's advisory check (validation/bug-museum/compare.mjs) fails a pull request
// only for an exhibit that regressed against the main verdict STATUS.md records. An
// exhibit added since the last recording has no main verdict: it is reported as new,
// and never fails the check, with or without a verdict of its own.
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { afterAll, expect, it } from "vitest";

const compare = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "../validation/bug-museum/compare.mjs",
);
const dir = fs.mkdtempSync(path.join(os.tmpdir(), "vn-museum-compare-"));
afterAll(() => fs.rmSync(dir, { recursive: true, force: true }));

function run(exhibits: object[], verdicts: Record<string, object>) {
  const exhibitsFile = path.join(dir, "exhibits.json");
  const verdictsFile = path.join(dir, "verdicts.json");
  fs.writeFileSync(exhibitsFile, JSON.stringify({ exhibits }));
  fs.writeFileSync(verdictsFile, JSON.stringify({ verdicts }));
  const result = spawnSync(
    process.execPath,
    [compare, "--verdicts", verdictsFile, "--exhibits", exhibitsFile],
    { encoding: "utf8", env: { ...process.env, GITHUB_STEP_SUMMARY: "" } },
  );
  return { status: result.status, out: result.stdout };
}

const pass = { verdict: "PASS" };
const bug = { verdict: "FAIL", matchesBug: true, failures: ["a.test.ts: the bug"] };

it("reports an exhibit with no main verdict as new, and does not fail", () => {
  const { status, out } = run(
    [{ id: "recorded", status: { main: "PASS" } }, { id: "added" }, { id: "added-not-run" }],
    { recorded: pass, added: bug },
  );
  expect(out).toMatch(/\| added \| - \| FAIL \(bug\) \| new \|/);
  expect(out).toMatch(/\| added-not-run \| - \| - \| new \|/);
  expect(out).toMatch(/2 new \(no main verdict recorded yet\)/);
  expect(status).toBe(0);
});

it("still fails for a recorded exhibit that regressed or did not run", () => {
  expect(run([{ id: "x", status: { main: "PASS" } }], { x: bug }).status).toBe(1);
  expect(run([{ id: "x", status: { main: "PASS" } }], {}).status).toBe(1);
  expect(run([{ id: "x", status: { main: "FAIL (bug)" } }], { x: bug }).status).toBe(0);
});

it("fails when an exhibit's bug shows again where main failed some other way", () => {
  const other = { verdict: "FAIL", matchesBug: false, failures: ["a.test.ts: something else"] };
  const { status, out } = run([{ id: "x", status: { main: "FAIL (other)" } }], { x: bug });
  expect(out).toMatch(/\| x \| FAIL \(other\) \| FAIL \(bug\) \| regressed \|/);
  expect(status).toBe(1);
  // The other way round too: the exhibit no longer reaches its bug.
  expect(run([{ id: "x", status: { main: "FAIL (bug)" } }], { x: other }).status).toBe(1);
});

it("does not fail for an exhibit that now passes, a fix to record", () => {
  const { status, out } = run([{ id: "x", status: { main: "FAIL (bug)" } }], { x: pass });
  expect(out).toMatch(/\| x \| FAIL \(bug\) \| PASS \| now passes \|/);
  expect(status).toBe(0);
});

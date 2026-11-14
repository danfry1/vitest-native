/**
 * test:native split across parallel CI jobs (scripts/ci/shard.mjs): every script runs in
 * exactly one shard, the longest scripts land on different shards, and the Full gate's
 * sharded Windows jobs together run each native step once. Whole, the Windows native
 * job ran a median 28 minutes against its 30-minute timeout.
 */
import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
// @ts-expect-error — runtime .mjs, no types
import { SCRIPT_DEADLINES } from "../scripts/ci/script-deadlines.mjs";
// @ts-expect-error — runtime .mjs, no types
import { parseShard, scriptsInShard } from "../scripts/ci/shard.mjs";

const packageRoot = path.resolve(import.meta.dirname, "..");
const repoRoot = path.resolve(packageRoot, "../..");
const testNative: string[] = JSON.parse(
  fs.readFileSync(path.join(packageRoot, "package.json"), "utf8"),
)
  .scripts["test:native"].split(" ")
  .slice(2);

describe("test:native shards", () => {
  it("parses k/n and rejects anything else", () => {
    expect(parseShard(undefined)).toBeUndefined();
    expect(parseShard("")).toBeUndefined();
    expect(parseShard("2/3")).toEqual({ index: 2, count: 3 });
    for (const bad of ["0/2", "3/2", "1-2", "a/b", "1/", "/2", " 1/2"]) {
      expect(() => parseShard(bad), bad).toThrow(/k\/n/);
    }
  });

  it("puts every test:native script in exactly one shard, in the listed order", () => {
    expect(testNative.length).toBeGreaterThan(10);
    expect(scriptsInShard(testNative, undefined)).toEqual(testNative);
    const list = ["a", "b", "c", "d", "e"];
    expect(scriptsInShard(list, { index: 1, count: 2 })).toEqual(["a", "c", "e"]);
    expect(scriptsInShard(list, { index: 2, count: 2 })).toEqual(["b", "d"]);
    for (const count of [1, 2, 3, 4]) {
      const shards = Array.from({ length: count }, (_, i) =>
        scriptsInShard(testNative, { index: i + 1, count }),
      );
      expect(shards.flat().sort()).toEqual([...testNative].sort());
      for (const shard of shards) {
        expect(shard).toEqual(testNative.filter((script) => shard.includes(script)));
      }
    }
  });

  it("lists the longest scripts first, so two shards split them", () => {
    // The scripts with their own deadlines are the long ones (script-deadlines.mjs).
    const longest = Object.keys(SCRIPT_DEADLINES);
    expect(longest.length).toBe(2);
    expect(testNative.slice(0, longest.length).sort()).toEqual([...longest].sort());
    const first = scriptsInShard(testNative, { index: 1, count: 2 });
    expect(longest.filter((script) => first.includes(script))).toHaveLength(1);
  });

  it("the Full gate's sharded jobs pass their shard and run each other native step once", () => {
    const ci = fs.readFileSync(path.join(repoRoot, ".github/workflows/ci.yml"), "utf8");
    const check = ci.slice(ci.indexOf("\n  check:\n"), ci.indexOf("\n  packed:\n"));
    expect(check).toMatch(/^ {4}name: Full gate .*matrix\.shard/m);

    // Each sharded leg is a `native` part, and an OS's shards are 1/n..n/n.
    const legs = check.split(/\n(?= {10}- os: )/).slice(1);
    const sharded = legs.filter((leg) => /^ {12}shard: /m.test(leg));
    expect(sharded.length).toBeGreaterThanOrEqual(2);
    const byOs = new Map<string, string[]>();
    for (const leg of sharded) {
      expect(leg).toMatch(/^ {12}part: native$/m);
      const os = /- os: (\S+)/.exec(leg)![1];
      byOs.set(os, [...(byOs.get(os) ?? []), /^ {12}shard: (\S+)/m.exec(leg)![1]]);
    }
    for (const shards of byOs.values()) {
      const count = shards.length;
      expect(shards).toEqual(Array.from({ length: count }, (_, i) => `${i + 1}/${count}`));
    }

    const steps = check.split(/\n(?= {6}- )/).slice(1);
    const named = (step: string) => /- name: (.*)/.exec(step)?.[1] ?? step.slice(0, 40);
    const runAll = steps.filter((step) => /run: bun run test:native$/m.test(step));
    expect(runAll.map(named)).toEqual(["Native engine tests"]);
    expect(runAll[0]).toMatch(/^ {10}VN_TEST_SHARD: \$\{\{ matrix\.shard \}\}$/m);

    // Every other step a native leg runs is skipped on all shards but the last, so the
    // split jobs run it once between them, as the whole leg did.
    const onNative = steps.filter(
      (step) =>
        step !== runAll[0] &&
        /^ {8}if: .*needs\.classify\.outputs\.native != 'false'/m.test(step) &&
        !/matrix\.part != 'native'/.test(step) &&
        !/^ {8}if: runner\.os == 'Linux' &&/m.test(step),
    );
    expect(onNative.length).toBeGreaterThanOrEqual(8);
    for (const step of onNative) {
      expect(step, named(step)).toMatch(/^ {8}if: .*&& matrix\.shard != '1\/2'/m);
    }
  });
});

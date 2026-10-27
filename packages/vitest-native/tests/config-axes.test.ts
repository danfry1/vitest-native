/**
 * The configuration-axis matrix's own machinery (validation/config-axes, documented in
 * docs/config-axis-matrix.md): the pairwise generator, the known-failing verdict, and
 * the catalog's consistency. The probes themselves run only in the matrix's CI jobs,
 * against a packed install; this suite checks that what the jobs are told to run, and
 * how their results are judged, cannot quietly cover less than it says.
 */
import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
// @ts-expect-error — runtime .mjs, no types
import {
  allowed,
  cartesian,
  cellsFor,
  readAxes,
  scopeFor,
} from "../validation/config-axes/cells.mjs";
// @ts-expect-error — runtime .mjs, no types
import { PROBES } from "../validation/config-axes/probes.mjs";
import {
  judge,
  matchingEntries,
  readKnownFailing,
  validateEntries,
  // @ts-expect-error — runtime .mjs, no types
} from "../validation/config-axes/verdict.mjs";

type Row = Record<string, string>;
type Cell = Row & { runs: Row[] };

const axes = readAxes();
const allAxes: Record<string, string[]> = { ...axes.install, ...axes.runtime };
const names = Object.keys(allAxes);
const rowsOf = (cells: Cell[]): Row[] =>
  cells.flatMap(({ runs, ...install }) => runs.map((run) => ({ ...install, ...run })));
const allowedRows: Row[] = cartesian(allAxes).filter((row: Row) => allowed(row, axes.constraints));

describe("cells", () => {
  it("pairwise: every pair of axis values that some allowed run has is covered", () => {
    const rows = rowsOf(cellsFor(axes, "pairwise"));
    const missing: string[] = [];
    for (let i = 0; i < names.length; i++) {
      for (let j = i + 1; j < names.length; j++) {
        const [a, b] = [names[i], names[j]];
        for (const x of allAxes[a]) {
          for (const y of allAxes[b]) {
            const possible = allowedRows.some((row) => row[a] === x && row[b] === y);
            const covered = rows.some((row) => row[a] === x && row[b] === y);
            if (possible && !covered) missing.push(`${a}=${x} & ${b}=${y}`);
          }
        }
      }
    }
    expect(missing).toEqual([]);
  });

  it("pairwise: no run breaks a constraint, and no install is a job twice", () => {
    const cells: Cell[] = cellsFor(axes, "pairwise");
    for (const row of rowsOf(cells))
      expect(allowed(row, axes.constraints), JSON.stringify(row)).toBe(true);
    const keys = cells.map(({ vitest, rntl, layout }) => `${vitest}/${rntl}/${layout}`);
    expect(new Set(keys).size).toBe(keys.length);
    // The job count is the cost on every pull request; it is the largest install pair.
    const largestPair = Math.max(
      ...Object.values(axes.install as Record<string, string[]>).flatMap((a, i, all) =>
        all.slice(i + 1).map((b) => a.length * b.length),
      ),
    );
    expect(cells.length).toBe(largestPair);
  });

  it("pairwise is deterministic", () => {
    expect(cellsFor(axes, "pairwise")).toEqual(cellsFor(axes, "pairwise"));
  });

  it("full: every allowed combination of every axis, once", () => {
    const rows = rowsOf(cellsFor(axes, "full"));
    expect(rows.length).toBe(allowedRows.length);
    expect(new Set(rows.map((row) => JSON.stringify(row))).size).toBe(rows.length);
  });

  it("pull requests run pairwise unless they change the matrix itself", () => {
    expect(scopeFor("pull_request", ["packages/vitest-native/src/plugin.ts"])).toBe("pairwise");
    expect(
      scopeFor("pull_request", [
        "packages/vitest-native/validation/config-axes/known-failing.json",
      ]),
    ).toBe("full");
    expect(scopeFor("pull_request", [".github/workflows/config-axis-matrix.yml"])).toBe("full");
    expect(scopeFor("push", [])).toBe("full");
    expect(scopeFor("schedule", [])).toBe("full");
  });
});

describe("verdict", () => {
  const entries = [{ probe: "p", when: { engine: "native", rntl: ["12", "13"] }, fixedBy: "#1" }];
  const run = (over: Row) => ({ ...allowedRows[0], engine: "native", rntl: "12", ...over });

  it("a listed failure is known; an unlisted one is a regression", () => {
    expect(judge(entries, "p", run({}), { status: "fail" })).toMatchObject({
      outcome: "known",
      ok: true,
    });
    expect(judge(entries, "p", run({ rntl: "14" }), { status: "fail" })).toMatchObject({
      outcome: "REGRESSION",
      ok: false,
    });
    expect(judge(entries, "other", run({}), { status: "fail" })).toMatchObject({ ok: false });
  });

  it("a listed probe that passes is stale, so the list can only shrink", () => {
    expect(judge(entries, "p", run({}), { status: "pass" })).toMatchObject({
      outcome: "STALE",
      ok: false,
    });
    expect(judge(entries, "p", run({ engine: "mock" }), { status: "pass" })).toMatchObject({
      outcome: "pass",
      ok: true,
    });
  });

  it("a probe that cannot observe its defect is neither a pass nor a failure", () => {
    expect(judge(entries, "p", run({}), { status: "n/a" })).toMatchObject({
      outcome: "n/a",
      ok: true,
    });
  });

  it("an entry without `when` matches every run", () => {
    expect(matchingEntries([{ probe: "p", fixedBy: "#1" }], "p", run({}))).toHaveLength(1);
  });
});

describe("known-failing.json", () => {
  const known = readKnownFailing();

  it("names real probes, real axis values, a fixing PR and a reason", () => {
    expect(validateEntries(known, axes, PROBES)).toEqual([]);
    expect(
      validateEntries(
        [{ probe: "nope", when: { engin: "native", rntl: "11" }, fixedBy: "342" }],
        axes,
        PROBES,
      ),
    ).toHaveLength(5);
  });

  it("every entry matches some allowed run where its probe applies — otherwise it could never go stale", () => {
    const applies = (probe: { requires?: Row }, row: Row) =>
      Object.entries(probe.requires ?? {}).every(([axis, value]) => row[axis] === value);
    const unreachable = known.filter((entry: { probe: string }) => {
      const probe = PROBES.find((p: { id: string }) => p.id === entry.probe);
      return !allowedRows.some(
        (row) => applies(probe, row) && matchingEntries([entry], entry.probe, row).length > 0,
      );
    });
    expect(unreachable).toEqual([]);
  });
});

describe("probe catalog", () => {
  const dir = path.resolve(
    import.meta.dirname,
    "../validation/config-axes/fixture/apps/app/probes",
  );

  it("every probe file belongs to exactly one probe, and every listed file exists", () => {
    const listed = PROBES.flatMap((probe: { files?: string[] }) => probe.files ?? []);
    expect(new Set(listed).size).toBe(listed.length);
    expect([...listed].sort()).toEqual(fs.readdirSync(dir).sort());
  });

  it("ids are unique, and every probe names the bug it was written from", () => {
    const ids = PROBES.map((probe: { id: string }) => probe.id);
    expect(new Set(ids).size).toBe(ids.length);
    for (const probe of PROBES) expect(probe.bug, probe.id).toMatch(/^#\d+: /);
  });
});

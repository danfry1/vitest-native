import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

// docs/adr/ holds the decision records that code, comments and the contributor guide
// cite as "ADR NNNN". A record is only worth citing while it is true, so these checks
// fail when a record's header drifts from the template or points at something gone.
const repoRoot = path.resolve(import.meta.dirname, "../../..");
const adrDir = path.join(import.meta.dirname, "../docs/adr");
const records = fs
  .readdirSync(adrDir)
  .filter((file) => /^\d{4}-[a-z]-[\w-]+\.md$/.test(file))
  .sort();
const read = (file: string) => fs.readFileSync(path.join(adrDir, file), "utf8");

/** The value of a `- **Field:** value` header line, or every match if it repeats. */
const fields = (text: string, name: string) =>
  [...text.matchAll(new RegExp(`^- \\*\\*${name}:\\*\\* (.*)$`, "gm"))].map((m) => m[1]);

describe("decision records", () => {
  it("are found", () => {
    expect(records.length).toBeGreaterThanOrEqual(40);
  });

  it.each(records)("%s has a heading that matches its file name", (file) => {
    expect(read(file).split("\n", 1)[0]).toMatch(new RegExp(`^# ${file.slice(0, 6)}\\. \\S`));
  });

  it.each(records)("%s has exactly one status", (file) => {
    const status = fields(read(file), "Status");
    expect(status).toHaveLength(1);
    expect(status[0]).toMatch(
      /^(Accepted|Proposed|Deprecated|Superseded by \[\d{4}-[a-z]\]\(\d{4}-[a-z]-[\w-]+\.md\))$/,
    );
  });

  it.each(records)("%s says how much of it is on main", (file) => {
    const implemented = fields(read(file), "Implemented");
    expect(implemented).toHaveLength(1);
    expect(implemented[0]).toMatch(/^(Yes|No|Partly: \S.*|No: \S.*)$/);
  });

  it.each(records)("%s names only enforcement paths that exist", (file) => {
    const [enforcedBy] = fields(read(file), "Enforced by");
    expect(enforcedBy).toBeDefined();
    if (enforcedBy === "Review only") return;
    const paths = [...(enforcedBy ?? "").matchAll(/`([^`]+)`/g)].map((m) => m[1]);
    expect(paths.length).toBeGreaterThan(0);
    expect(paths.filter((p) => !fs.existsSync(path.join(repoRoot, p)))).toEqual([]);
  });

  it.each(records)("%s links only to records that exist", (file) => {
    const targets = [...read(file).matchAll(/\]\(([^)#]+\.md)\)/g)].map((m) => m[1]);
    expect(targets.filter((target) => !records.includes(target))).toEqual([]);
  });
});

describe("the index", () => {
  it("lists every record once, and nothing else", () => {
    const listed = [...read("README.md").matchAll(/\]\((\d{4}-[a-z]-[\w-]+\.md)\)/g)].map(
      (m) => m[1],
    );
    expect(listed).toEqual(records);
  });
});

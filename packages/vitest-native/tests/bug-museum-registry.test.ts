// Every exhibit directory in the bug museum is registered in exhibits.json, and every
// registered exhibit has its directory. A merge that kept a stale exhibits.json would
// otherwise drop exhibits silently: run.mjs and status.mjs only see registered ones.
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { expect, it } from "vitest";

const museum = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "../validation/bug-museum",
);

it("registers exactly the exhibits that have a directory", () => {
  const directories = fs
    .readdirSync(path.join(museum, "exhibits"), { withFileTypes: true })
    .filter((entry) => entry.isDirectory())
    .map((entry) => entry.name)
    .sort();
  const registered: string[] = JSON.parse(
    fs.readFileSync(path.join(museum, "exhibits.json"), "utf8"),
  ).exhibits.map((exhibit: { id: string }) => exhibit.id);
  expect(new Set(registered).size, "duplicate ids in exhibits.json").toBe(registered.length);
  expect(directories.length, "the museum has no exhibits").toBeGreaterThan(0);
  expect([...registered].sort()).toEqual(directories);
});

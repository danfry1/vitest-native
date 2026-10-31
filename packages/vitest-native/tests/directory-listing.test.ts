// The resolver answers every extension and exact-case candidate in a directory from one
// listing of it, reused while the directory is unchanged (src/native/resolve.mjs,
// listDirectory). These pin what that listing must keep: exact names on case-insensitive
// disks, Metro's candidate order, symlink targets, and freshness when a file is added or
// removed between lookups.
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterAll, afterEach, describe, expect, it, vi } from "vitest";
import { extensionsFor, firstExact } from "../src/native/resolve.mjs";
import { reactNative } from "../src/index.js";
import { runPluginConfig } from "./plugin-config.js";

const root = fs.mkdtempSync(path.join(os.tmpdir(), "vn-dir-listing-"));
afterAll(() => fs.rmSync(root, { recursive: true, force: true }));
afterEach(() => vi.restoreAllMocks());

let counter = 0;
/** A fresh directory holding `files`, dated a minute back so its listing is kept. */
function stillDir(files: string[]): string {
  const dir = path.join(root, `d${counter++}`);
  fs.mkdirSync(dir);
  for (const file of files) fs.writeFileSync(path.join(dir, file), "");
  backdate(dir);
  return dir;
}
function backdate(dir: string) {
  const past = new Date(Date.now() - 60_000);
  fs.utimesSync(dir, past, past);
}
const IOS = extensionsFor("ios");

const realStatSync = fs.statSync;
/** Report `dir`'s stat with `change` applied; every other path is stat'ed as usual. */
function statOf(dir: string, change: (stat: fs.Stats) => void) {
  return vi.spyOn(fs, "statSync").mockImplementation(((file: fs.PathLike, options?: never) => {
    const stat = realStatSync(file, options) as fs.Stats;
    if (file === dir) change(stat);
    return stat;
  }) as typeof fs.statSync);
}
const readsOf = (spy: { mock: { calls: unknown[][] } }, dir: string) =>
  spy.mock.calls.filter(([d]) => d === dir).length;

describe("directory listing", () => {
  it("misses a name that differs only in case, also once the listing is held", () => {
    // The React Native template: `./App` beside `app.json` and `App.tsx`. Metro tries
    // `.json` before `.tsx`; a case-insensitive disk says `App.json` exists.
    const dir = stillDir(["app.json", "App.tsx"]);
    const base = path.join(dir, "App");
    expect(firstExact(base, IOS)).toBe(base + ".tsx");
    expect(firstExact(base, IOS)).toBe(base + ".tsx");
    expect(firstExact(base, [".json"])).toBe(null);
    expect(firstExact(path.join(dir, "app"), [".json"])).toBe(path.join(dir, "app.json"));
  });

  it("reads a directory once for every candidate and lookup while it is unchanged", () => {
    const dir = stillDir(Array.from({ length: 50 }, (_, i) => `m${i}.tsx`));
    const readdir = vi.spyOn(fs, "readdirSync");
    for (let i = 0; i < 50; i++) {
      expect(firstExact(path.join(dir, `m${i}`), IOS)).toBe(path.join(dir, `m${i}.tsx`));
    }
    expect(firstExact(path.join(dir, "missing"), IOS)).toBe(null);
    const reads = readdir.mock.calls.filter(([d]) => d === dir).length;
    expect(reads).toBe(1);
  });

  it("sees a file added after the directory was listed, and one removed", () => {
    // `vitest --watch`: an import of a file that did not exist on the last run.
    const dir = stillDir(["a.ts"]);
    const base = path.join(dir, "added");
    expect(firstExact(base, IOS)).toBe(null);
    fs.writeFileSync(base + ".tsx", "");
    expect(firstExact(base, IOS)).toBe(base + ".tsx");
    // A platform variant added beside it wins from the next lookup on.
    backdate(dir);
    expect(firstExact(base, IOS)).toBe(base + ".tsx");
    fs.writeFileSync(base + ".ios.tsx", "");
    expect(firstExact(base, IOS)).toBe(base + ".ios.tsx");
    backdate(dir);
    expect(firstExact(base, IOS)).toBe(base + ".ios.tsx");
    fs.rmSync(base + ".ios.tsx");
    fs.rmSync(base + ".tsx");
    expect(firstExact(base, IOS)).toBe(null);
  });

  it("keeps Metro's extension-major order, whatever order the directory lists", () => {
    // `.native.js` beats `.ios.tsx`: the js round completes before tsx is tried.
    const dir = stillDir([
      "Foo.tsx",
      "Foo.ios.tsx",
      "Foo.native.js",
      "Bar.android.tsx",
      "Bar.native.jsx",
      "Bar.tsx",
    ]);
    expect(firstExact(path.join(dir, "Foo"), IOS)).toBe(path.join(dir, "Foo.native.js"));
    const android = extensionsFor("android");
    expect(firstExact(path.join(dir, "Bar"), android)).toBe(path.join(dir, "Bar.native.jsx"));
    expect(firstExact(path.join(dir, "Bar"), [".tsx", ".android.tsx"])).toBe(
      path.join(dir, "Bar.tsx"),
    );
  });

  it("follows symbolic links as existsSync does: a dangling one is no file", () => {
    const dir = stillDir(["target.ts"]);
    fs.symlinkSync(path.join(dir, "target.ts"), path.join(dir, "linked.ts"));
    fs.symlinkSync(path.join(dir, "gone.ts"), path.join(dir, "dangling.ts"));
    backdate(dir);
    expect(firstExact(path.join(dir, "linked"), IOS)).toBe(path.join(dir, "linked.ts"));
    expect(firstExact(path.join(dir, "dangling"), IOS)).toBe(null);
  });

  it("answers nothing for a missing directory, or a file where one was expected", () => {
    const dir = stillDir(["file.ts"]);
    expect(firstExact(path.join(dir, "nope", "index"), IOS)).toBe(null);
    expect(firstExact(path.join(dir, "file.ts", "index"), IOS)).toBe(null);
  });
});

describe("listing freshness", () => {
  it.each(["mtimeMs", "ctimeMs", "ino", "dev"] as const)(
    "reads the directory again when only its %s changes",
    (field) => {
      // mtime/ctime: an entry added or removed. ino/dev: a symlinked path (a pnpm store
      // link) re-pointed at another directory carrying the same times.
      const dir = stillDir(["a.ts"]);
      const readdir = vi.spyOn(fs, "readdirSync");
      expect(firstExact(path.join(dir, "a"), IOS)).toBe(path.join(dir, "a.ts"));
      expect(firstExact(path.join(dir, "a"), IOS)).toBe(path.join(dir, "a.ts"));
      expect(readsOf(readdir, dir)).toBe(1);
      statOf(dir, (stat) => {
        (stat as unknown as Record<string, number>)[field] += 1;
      });
      expect(firstExact(path.join(dir, "a"), IOS)).toBe(path.join(dir, "a.ts"));
      expect(readsOf(readdir, dir)).toBe(2);
    },
  );

  it("does not keep a listing of a directory changed within the last two seconds", () => {
    // Where timestamps count whole seconds, a second change in the same second would
    // leave the times unchanged; such a listing is read again on every lookup.
    const dir = stillDir(["a.ts"]);
    const now = Date.now();
    statOf(dir, (stat) => {
      stat.mtimeMs = now;
      stat.ctimeMs = now;
    });
    const readdir = vi.spyOn(fs, "readdirSync");
    firstExact(path.join(dir, "a"), IOS);
    firstExact(path.join(dir, "a"), IOS);
    expect(readsOf(readdir, dir)).toBe(2);
  });

  it("judges recent changes by the real clock, not a test's fake one", () => {
    // The resolver runs in the test's realm, where fake timers move `Date.now`. With the
    // clock a minute ahead, a directory changed this second looked still, and a file
    // added within the same (coarse) second was missed.
    const dir = stillDir(["a.ts"]);
    const second = Math.floor(Date.now() / 1000) * 1000;
    statOf(dir, (stat) => {
      stat.mtimeMs = second;
      stat.ctimeMs = second;
    });
    vi.spyOn(Date, "now").mockReturnValue(Date.now() + 60_000);
    const base = path.join(dir, "late");
    expect(firstExact(base, IOS)).toBe(null);
    fs.writeFileSync(base + ".ts", "");
    expect(firstExact(base, IOS)).toBe(base + ".ts");
  });

  it("answers from the filesystem for one call when a listing fails, then lists again", () => {
    // A transient failure (EMFILE) must not switch off the exact-case check for the
    // directory: `./App` would resolve to `app.json` on a case-insensitive disk.
    const dir = stillDir(["app.json", "App.tsx"]);
    const base = path.join(dir, "App");
    const realReaddir = fs.readdirSync;
    const readdir = vi.spyOn(fs, "readdirSync").mockImplementationOnce(() => {
      throw Object.assign(new Error("EMFILE: too many open files"), { code: "EMFILE" });
    });
    // The failing call keeps the filesystem's verdict, as an unreadable directory does.
    expect(firstExact(base, IOS)).not.toBe(null);
    readdir.mockImplementation(realReaddir);
    expect(firstExact(base, IOS)).toBe(base + ".tsx");
    expect(firstExact(base, [".json"])).toBe(null);
    expect(readsOf(readdir, dir)).toBe(2);
  });
});

describe("plugin resolveId", () => {
  it("resolves an extensionless import of a file added during a watch run", async () => {
    const dir = stillDir(["App.tsx"]);
    const importer = path.join(dir, "App.tsx");
    const plugin = reactNative({ engine: "mock" }) as any;
    await runPluginConfig(plugin, { root }, { command: "serve", mode: "test" });
    expect(plugin.resolveId("./Late", importer)).toBeUndefined();
    fs.writeFileSync(path.join(dir, "Late.tsx"), "");
    expect(plugin.resolveId("./Late", importer)).toBe(path.join(dir, "Late.tsx"));
    // And a directory index, which is listed separately.
    expect(plugin.resolveId("./feature", importer)).toBeUndefined();
    fs.mkdirSync(path.join(dir, "feature"));
    fs.writeFileSync(path.join(dir, "feature", "index.ts"), "");
    expect(plugin.resolveId("./feature", importer)).toBe(path.join(dir, "feature", "index.ts"));
  });
});

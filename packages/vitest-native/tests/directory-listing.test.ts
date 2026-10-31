// The resolver answers every extension and exact-case candidate in a directory from one
// listing of it, reused while the directory is unchanged (src/native/resolve.mjs,
// listDirectory). These pin what that listing must keep: exact names on case-insensitive
// disks, Metro's candidate order, symlink targets, and freshness when a file is added or
// removed during a watch run.
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

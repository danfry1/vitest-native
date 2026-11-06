// What a cold resolution costs the shared resolver, against Node's own (ADR-0005 KC3:
// "stats per cold miss no higher than Node's"). A child process resolves the same bare
// requests, from the same files, once with Node's require.resolve and once with the
// shared resolver, and counts the filesystem calls each makes: `stat`, `lstat`,
// `exists`, `readlink`, `realpath` and `readdir` at the fs API, plus Node's own module
// stats through `Module._stat`. Node's realpath calls count one each (its loader caches
// every path it resolved); the resolver's count one per path segment, the cost of an
// uncached walk, so a resolver that stopped caching real paths fails here. Manifest reads are counted separately (Node reads package.json in C++,
// outside the fs API, so they cannot be compared call for call).
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { pathToFileURL } from "node:url";
import { afterAll, describe, expect, it } from "vitest";

const root = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), "vn-resolver-cost-")));
afterAll(() => fs.rmSync(root, { recursive: true, force: true }));

function write(file: string, body = ""): void {
  fs.mkdirSync(path.dirname(path.join(root, file)), { recursive: true });
  fs.writeFileSync(path.join(root, file), body);
}

// Packages of every shape the resolver answers, installed flat and one in a store
// directory behind a symlink, as pnpm and bun lay them out.
write("package.json", JSON.stringify({ name: "cost-app" }));
const shapes: Record<string, object> = {
  "exp-lib": {
    exports: {
      ".": { require: "./cjs.js", import: "./esm.mjs" },
      "./sub": "./sub.js",
      "./a": "./a.js",
      "./b": "./b.js",
      "./c": "./c.js",
    },
  },
  "main-lib": { main: "./lib/main.js" },
  "rn-lib": { main: "./main.js", "react-native": "./native.js" },
  "@scope/scoped": { exports: "./index.js" },
};
for (const [name, manifest] of Object.entries(shapes)) {
  write(`node_modules/${name}/package.json`, JSON.stringify({ name, ...manifest }));
  for (const file of [
    "cjs.js",
    "esm.mjs",
    "sub.js",
    "lib/main.js",
    "main.js",
    "native.js",
    "index.js",
    "a.js",
    "b.js",
    "c.js",
  ])
    write(`node_modules/${name}/${file}`);
}
write(
  "node_modules/.store/linked-lib@1.0.0/node_modules/linked-lib/package.json",
  JSON.stringify({ name: "linked-lib", exports: "./index.js" }),
);
write("node_modules/.store/linked-lib@1.0.0/node_modules/linked-lib/index.js");
fs.symlinkSync(
  path.join(root, "node_modules/.store/linked-lib@1.0.0/node_modules/linked-lib"),
  path.join(root, "node_modules/linked-lib"),
  "junction",
);
// Several subpaths of one package: each is its own answer, and one package directory.
const requests = [
  "exp-lib",
  "exp-lib/sub",
  "exp-lib/a",
  "exp-lib/b",
  "exp-lib/c",
  "main-lib",
  "rn-lib",
  "@scope/scoped",
  "linked-lib",
];
// Requesting files at several depths, as an app's source tree has them.
const parents = ["src/a.js", "src/screens/b.js", "src/screens/home/widgets/c.js"].map((f) => {
  write(f);
  return path.join(root, f);
});

const resolverUrl = pathToFileURL(
  path.resolve(import.meta.dirname, "../src/native/shared-resolver.mjs"),
);
function measure(which: "node" | "resolver") {
  const script = `
    import fs from "node:fs";
    import Module, { createRequire } from "node:module";
    import { createSharedResolver, nodeDefaultConditions } from ${JSON.stringify(resolverUrl.href)};
    const counts = { stat: 0, lstat: 0, exists: 0, readlink: 0, realpath: 0, readdir: 0, moduleStat: 0, reads: 0 };
    const wrap = (name, key) => { const f = fs[name]; fs[name] = function (...a) { counts[key]++; return f.apply(this, a); }; };
    wrap("statSync", "stat"); wrap("lstatSync", "lstat"); wrap("existsSync", "exists");
    wrap("readdirSync", "readdir"); wrap("readFileSync", "reads"); wrap("readlinkSync", "readlink");
    const realpath = fs.realpathSync;
    // Node's own realpath calls (its loader, and Node's resolution the resolver defers to
    // for \`main\`) are cached; one the resolver module makes itself is a full walk.
    // The caller is the frame after this wrapper's (stack lines: message, cost, wrapper, caller).
    const cost = (p) =>
      (new Error().stack.split("\\n")[3] ?? "").includes("shared-resolver.mjs")
        ? String(p).split(/[\\\\/]/).filter(Boolean).length
        : 1;
    const native = realpath.native;
    fs.realpathSync = Object.assign(function (...a) { counts.realpath += cost(a[0]); return realpath.apply(this, a); }, {
      native: function (...a) { counts.realpath++; return native.apply(this, a); },
    });
    Module._stat = (file) => {
      counts.moduleStat++;
      const s = fs.statSync.call(fs, file, { throwIfNoEntry: false });
      counts.stat--; // counted as a module stat, not twice
      return s === undefined ? -2 : s.isDirectory() ? 1 : 0;
    };
    const requests = ${JSON.stringify(requests)};
    const parents = ${JSON.stringify(parents)};
    const resolver = createSharedResolver({
      projectRoot: ${JSON.stringify(root)},
      platform: "ios",
      conditions: [...nodeDefaultConditions(process.features)].sort(),
    });
    for (const k of Object.keys(counts)) counts[k] = 0;
    const answers = [];
    for (const parent of parents) {
      for (const request of requests) {
        const req = createRequire(parent);
        answers.push(${JSON.stringify(which)} === "node"
          ? req.resolve(request)
          : resolver.resolve(request, parent, (id) => req.resolve(id)));
      }
    }
    console.log(JSON.stringify({ answers, ...counts }));
  `;
  const proc = spawnSync(
    process.execPath,
    ["--no-warnings", "--input-type=module", "--eval", script],
    {
      cwd: root,
      encoding: "utf8",
      timeout: 60_000,
    },
  );
  expect(proc.status, proc.stderr).toBe(0);
  return JSON.parse(proc.stdout.trim().split("\n").at(-1)!);
}

const stats = (c: Record<string, number>) =>
  c.stat + c.lstat + c.exists + c.readlink + c.realpath + c.readdir + c.moduleStat;

describe("a cold resolution through the shared resolver", () => {
  it("costs no more stat calls than Node's own", () => {
    const node = measure("node");
    const resolver = measure("resolver");
    // The same files, in Node's spelling, except where the field policy differs by design:
    // a package without `exports` loads its `react-native` field, not `main`.
    expect(resolver.answers).toEqual(
      node.answers.map((file: string) =>
        file.includes(`${path.sep}rn-lib${path.sep}`)
          ? file.replace(/main\.js$/, "native.js")
          : file,
      ),
    );
    const { answers: _node, ...nodeCounts } = node;
    const { answers: _resolver, ...resolverCounts } = resolver;
    console.log("node", nodeCounts, "resolver", resolverCounts);
    expect(stats(resolverCounts)).toBeLessThanOrEqual(stats(nodeCounts));
  });
});

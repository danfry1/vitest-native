// Safety contracts against the package's actual stale-lookup drain.
import assert from "node:assert/strict";
import Module, { createRequire } from "node:module";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { test } from "node:test";
import { pathToFileURL } from "node:url";
import { installCacheDrainResearch } from "./probe-node-cjs-cache-drain.mjs";
const { registerHooks } = Module;

function setup(t) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "vn-cjs-drain-contract-"));
  const req = createRequire(path.join(dir, "package.json"));
  const tracker = installCacheDrainResearch();
  t.after(() => {
    tracker.dispose();
    for (const id of Object.keys(req.cache))
      if (id.startsWith(fs.realpathSync(dir) + path.sep)) delete req.cache[id];
    fs.rmSync(dir, { recursive: true, force: true });
  });
  const leaf = path.join(dir, "leaf.cjs");
  const entry = path.join(dir, "entry.cjs");
  fs.writeFileSync(leaf, "exports.value = 'leaf';");
  fs.writeFileSync(entry, "module.exports = require('./leaf.cjs');");
  return { dir, req, tracker, leaf, entry };
}

test("drain neither evaluates deleted modules nor appends children to a real parent", (t) => {
  const f = setup(t);
  f.req(f.entry);
  const entryId = f.req.resolve(f.entry);
  const leafId = f.req.resolve(f.leaf);
  const parent = f.req.cache[entryId];
  const children = [...parent.children];
  delete f.req.cache[leafId];
  fs.writeFileSync(f.leaf, "throw new Error('drain-executed-user-code');");
  const resolve = Module._resolveFilename;
  const load = Module.prototype.load;
  assert.ok(f.tracker.drain() > 0);
  assert.equal(f.req.cache[leafId], undefined);
  assert.deepEqual(parent.children, children);
  assert.equal(Module._resolveFilename, resolve);
  assert.equal(Module.prototype.load, load);
  assert.equal(f.tracker.pending, 0);
  assert.equal(
    Object.keys(Module._cache).some((id) => id.includes("vitest-native:cjs-cache-drain")),
    false,
  );
});

test("require.resolve-only edges do not load the resolved target during drain", (t) => {
  const f = setup(t);
  f.req.resolve(f.leaf);
  fs.writeFileSync(f.leaf, "throw new Error('resolve-only-target-executed');");
  assert.ok(f.tracker.drain() > 0);
  assert.equal(f.req.cache[f.req.resolve(f.leaf)], undefined);
});

test("retained targets stay identical, and their alias metadata is released", (t) => {
  const f = setup(t);
  const value = f.req(f.entry);
  for (let i = 1; i <= 30; i++)
    f.req.resolve(path.dirname(f.entry) + "/" + "./".repeat(i) + "leaf.cjs");
  assert.ok(f.tracker.pending > 0);
  assert.equal(f.tracker.drain(), 0);
  assert.equal(f.tracker.pending, 0);
  assert.equal(f.req(f.entry), value);
});

test("a later resolver cannot silently bypass tracking, even with zero recorded edges", async (t) => {
  const f = setup(t);
  const savedResolve = Module._resolveFilename;
  Module._resolveFilename = function (request, ...args) {
    if (request === "./leaf.cjs") return fs.realpathSync(f.leaf);
    return savedResolve.call(this, request, ...args);
  };
  try {
    const namespace = await import(pathToFileURL(f.entry).href + "?generation=1");
    assert.equal(namespace.default.value, "leaf");
    assert.equal(f.tracker.pending, 0, "the replacement must actually bypass tracking");
    delete f.req.cache[fs.realpathSync(f.entry)];
    delete f.req.cache[fs.realpathSync(f.leaf)];
    assert.throws(() => f.tracker.drain(), {
      code: "HOT_CJS_CACHE_RESET",
      message: /tracking resolver was replaced/,
    });
    // Without this rejection the next query import returns {} on tested Node
    // 20/22/24 versions. Do not encode that Node bug as a required behavior.
  } finally {
    Module._resolveFilename = savedResolve;
  }
});

test("a resolver installed before tracking remains supported and is restored", (t) => {
  const original = Module._resolveFilename;
  let calls = 0;
  const wrapper = function (...args) {
    calls++;
    return original.apply(this, args);
  };
  Module._resolveFilename = wrapper;
  // Restore after setup's own cleanup, which restores the preinstalled wrapper.
  const f = setup(t);
  t.after(() => {
    Module._resolveFilename = original;
  });
  f.req(f.entry);
  assert.ok(calls > 0);
  delete f.req.cache[fs.realpathSync(f.leaf)];
  assert.ok(f.tracker.drain() > 0);
  assert.equal(f.req(f.leaf).value, "leaf");
});

test("a reserved cache-key collision is refused without overwriting its owner", (t) => {
  const f = setup(t);
  f.req.resolve(f.leaf);
  const id = "\0vitest-native:cjs-cache-drain";
  const occupant = { loaded: true, exports: {} };
  Module._cache[id] = occupant;
  try {
    assert.throws(() => f.tracker.drain(), {
      code: "HOT_CJS_CACHE_RESET",
      message: /reserved cleanup cache entry/,
    });
    assert.equal(Module._cache[id], occupant);
  } finally {
    delete Module._cache[id];
  }
});

test(
  "forwarding synchronous hooks preserve the non-evaluating drain",
  { skip: !registerHooks },
  (t) => {
    const f = setup(t);
    const hook = registerHooks({ resolve: (specifier, context, next) => next(specifier, context) });
    try {
      f.req(f.entry);
      delete f.req.cache[fs.realpathSync(f.leaf)];
      fs.writeFileSync(f.leaf, "throw new Error('forwarding-hook-drain-executed');");
      assert.ok(f.tracker.drain() > 0);
      assert.equal(f.req.cache[fs.realpathSync(f.leaf)], undefined);
    } finally {
      hook.deregister();
    }
  },
);

test(
  "unexpected load-hook redirection refuses execution and restores loader state",
  { skip: !registerHooks },
  (t) => {
    const f = setup(t);
    f.req(f.entry);
    delete f.req.cache[f.req.resolve(f.leaf)];
    const resolve = Module._resolveFilename;
    const load = Module.prototype.load;
    // Deliberately bypass the temporary resolver. This is outside the drain's
    // supported contract; it must fail visibly, not execute the real target.
    const hook = registerHooks({
      resolve(specifier, context, nextResolve) {
        if (specifier === "./leaf.cjs") {
          return { url: pathToFileURL(f.leaf).href, format: "commonjs", shortCircuit: true };
        }
        return nextResolve(specifier, context);
      },
    });
    try {
      assert.throws(() => f.tracker.drain(), /cache-drain attempted module execution/);
      assert.equal(Module._resolveFilename, resolve);
      assert.equal(Module.prototype.load, load);
      assert.equal(
        Object.keys(Module._cache).some((id) => id.includes("vitest-native:cjs-cache-drain")),
        false,
      );
    } finally {
      hook.deregister();
    }
  },
);

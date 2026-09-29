// Dependency-free semantic gate. Fails on the unmodified tested Node versions.
// Unlike the observation probes, success means every assertion passed.
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { createRequire } from "node:module";
import { pathToFileURL } from "node:url";
import { test } from "node:test";

const drainResearch =
  process.env.VN_CJS_DRAIN_RESEARCH === "1"
    ? (await import("./probe-node-cjs-cache-drain.mjs")).installCacheDrainResearch()
    : null;

function fixture(t, entrySource, leafSource) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "vn-node-cjs-semantic-"));
  const canonical = fs.realpathSync(dir) + path.sep;
  const key = JSON.stringify(canonical);
  const req = createRequire(path.join(dir, "package.json"));
  globalThis[canonical] = { evaluations: 0, reject: false };
  const entry = path.join(dir, "entry.cjs");
  const leaf = path.join(dir, "leaf.cjs");
  fs.writeFileSync(entry, entrySource);
  fs.writeFileSync(leaf, `const state = globalThis[${key}]; state.evaluations++;\n${leafSource}`);
  const reset = () => {
    for (const id of Object.keys(req.cache)) if (id.startsWith(canonical)) delete req.cache[id];
    drainResearch?.drain();
  };
  t.after(() => {
    reset();
    delete globalThis[canonical];
    fs.rmSync(dir, { recursive: true, force: true });
  });
  return {
    reset,
    req,
    entry,
    leaf,
    state: globalThis[canonical],
    import: (generation) => import(pathToFileURL(entry).href + `?generation=${generation}`),
  };
}

test("fresh CJS re-export default/named identities and exactly-once evaluation", async (t) => {
  const f = fixture(t, "module.exports = require('./leaf.cjs');", "exports.value = 'leaf';");
  let previous;
  for (let generation = 1; generation <= 3; generation++) {
    f.reset();
    const namespace = await f.import(generation);
    assert.equal(namespace.default.value, "leaf");
    assert.equal(namespace.value, "leaf");
    assert.equal(namespace.default, f.req(f.entry));
    assert.equal(namespace.default, f.req(f.leaf));
    assert.notEqual(namespace.default, previous);
    assert.equal(f.state.evaluations, generation);
    assert.equal(f.req.cache[f.req.resolve(f.leaf)].loaded, true);
    previous = namespace.default;
  }
});

test("a real CJS cycle retains its partial exports without duplicate evaluation", async (t) => {
  const f = fixture(
    t,
    "exports.started = true; module.exports = require('./leaf.cjs');",
    "exports.value = require('./entry.cjs').started ? 'leaf' : 'broken-cycle';",
  );
  for (let generation = 1; generation <= 3; generation++) {
    f.reset();
    const namespace = await f.import(generation);
    assert.equal(namespace.default.value, "leaf");
    assert.equal(namespace.value, "leaf");
    assert.equal(f.state.evaluations, generation);
  }
});

test("rejected leaf is retried through a fresh URL, then survives later cache reset", async (t) => {
  const f = fixture(
    t,
    "module.exports = require('./leaf.cjs');",
    "if (state.reject) throw new Error('controlled-leaf-failure'); exports.value = 'leaf';",
  );
  f.state.reject = true;
  await assert.rejects(f.import("reject"), /controlled-leaf-failure/);
  assert.equal(f.state.evaluations, 1);
  assert.equal(f.req.cache[f.req.resolve(f.entry)], undefined);
  assert.equal(f.req.cache[f.req.resolve(f.leaf)], undefined);
  f.state.reject = false;
  for (let generation = 1; generation <= 3; generation++) {
    if (generation > 1) f.reset();
    const namespace = await f.import(generation);
    assert.equal(namespace.default.value, "leaf");
    assert.equal(namespace.value, "leaf");
    assert.equal(f.state.evaluations, generation + 1);
  }
});

test("concurrent URL variants share one CJS instance within each generation", async (t) => {
  const f = fixture(t, "module.exports = require('./leaf.cjs');", "exports.value = 'leaf';");
  let previous;
  for (let generation = 1; generation <= 3; generation++) {
    f.reset();
    const [a, b] = await Promise.all([f.import(`${generation}-a`), f.import(`${generation}-b`)]);
    assert.equal(a.default.value, "leaf");
    assert.equal(a.default, b.default);
    assert.notEqual(a.default, previous);
    assert.equal(f.state.evaluations, generation);
    previous = a.default;
  }
});

test("static discovery of an unused conditional re-export must not execute it", async (t) => {
  const f = fixture(
    t,
    "if (false) module.exports = require('./leaf.cjs'); exports.value = 'entry';",
    "throw new Error('unused-leaf-must-not-execute');",
  );
  for (let generation = 1; generation <= 3; generation++) {
    f.reset();
    const namespace = await f.import(generation);
    assert.equal(namespace.default.value, "entry");
    assert.equal(f.state.evaluations, 0);
  }
});

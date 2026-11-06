// A held answer whose file is gone (a nested copy uninstalled in watch mode, a fixture a
// test deleted) is resolved afresh by the shared resolver, not by Node: the require
// hook's memo is checked first, and the resolver forgets what it held. Under the old
// order the hook dropped its memo entry and fell through to Node's own resolution, which
// takes `main` where the resolver takes the `react-native` field: the package split.
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { createRequire } from "node:module";
import { afterAll, expect, test } from "vitest";

const root = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), "vn-stale-")));
afterAll(() => fs.rmSync(root, { recursive: true, force: true }));

function rnLib(dir: string, tag: string) {
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(
    path.join(dir, "package.json"),
    JSON.stringify({ name: "vn-stale-lib", main: "./main.js", "react-native": "./native.js" }),
  );
  fs.writeFileSync(path.join(dir, "main.js"), `module.exports = "${tag} main";`);
  fs.writeFileSync(path.join(dir, "native.js"), `module.exports = "${tag} react-native field";`);
}

test("a held answer whose file is gone is answered by the shared resolver again", () => {
  rnLib(path.join(root, "node_modules/vn-stale-lib"), "top");
  rnLib(path.join(root, "node_modules/consumer/node_modules/vn-stale-lib"), "nested");
  const consumer = path.join(root, "node_modules/consumer/index.js");
  fs.writeFileSync(consumer, "");
  const req = createRequire(consumer);
  expect(req.resolve("vn-stale-lib")).toMatch(/consumer[\\/]node_modules[\\/]vn-stale-lib[\\/]native\.js$/);
  fs.rmSync(path.join(root, "node_modules/consumer/node_modules"), { recursive: true });
  expect(req.resolve("vn-stale-lib")).toBe(path.join(root, "node_modules/vn-stale-lib/native.js"));
});

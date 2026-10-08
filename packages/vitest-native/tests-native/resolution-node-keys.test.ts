/**
 * A path the require hooks find themselves (Metro's platform scan, the project's
 * aliases, deep React Native paths) is spelled as Node spells its own resolutions:
 * the real path. Node keys Module._cache by that path, so a file found through a
 * symlink, or on Windows an alias target written with `/`, would otherwise load a
 * second time under a second key and give two instances of one module.
 */
import { createRequire } from "node:module";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterAll, expect, it } from "vitest";

const root = fs.mkdtempSync(path.join(os.tmpdir(), "vn-node-keys-"));
afterAll(() => fs.rmSync(root, { recursive: true, force: true }));

it.skipIf(process.platform === "win32")(
  "a platform-scan hit through a symlink is the instance Node's own resolution loads",
  () => {
    fs.mkdirSync(path.join(root, "app"));
    fs.mkdirSync(path.join(root, "shared"));
    fs.writeFileSync(path.join(root, "shared", "store.js"), "module.exports = { state: {} };\n");
    fs.symlinkSync(path.join(root, "shared", "store.js"), path.join(root, "app", "store.js"));
    fs.writeFileSync(
      path.join(root, "app", "entry.js"),
      // Extensionless: the hooks' platform scan. With the extension: Node's resolver.
      'module.exports = { scanned: require("./store"), byNode: require("./store.js") };\n',
    );
    const { scanned, byNode } = createRequire(import.meta.url)(path.join(root, "app", "entry.js"));
    expect(scanned).toBe(byNode);
  },
);

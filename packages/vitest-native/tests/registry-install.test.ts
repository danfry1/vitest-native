import { execFileSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { describe, expect, it } from "vitest";

const REGISTRY = pathToFileURL(
  path.join(path.dirname(fileURLToPath(import.meta.url)), "../src/native/registry.mjs"),
).href;

// installRegistry patches Module._load for the whole process, so this runs in a child.
describe("installRegistry", () => {
  it.skipIf(process.platform === "win32")(
    "resolves the registry's own deep requires from the project when its cache path is a symlink",
    () => {
      // macOS's tmpdir is `/var/…`, a symlink to `/private/var/…`: Node records the
      // registry module under the real path, so a check against the given spelling
      // missed it and resolved React Native's deep imports from the cache directory.
      const tmp = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), "vn-registry-")));
      try {
        const project = path.join(tmp, "project");
        const lib = path.join(project, "node_modules", "react-native", "Libraries");
        fs.mkdirSync(lib, { recursive: true });
        fs.writeFileSync(path.join(project, "package.json"), "{}");
        fs.writeFileSync(path.join(lib, "Deep.js"), "module.exports = 'deep';\n");

        const realCache = path.join(tmp, "real-cache");
        fs.mkdirSync(realCache);
        fs.writeFileSync(
          path.join(realCache, "rn.cjs"),
          `exports.__vitestNativeRegistry = {
             ids: [], entry: "", reset() {},
             load() { return require("react-native/Libraries/Deep"); },
           };\n`,
        );
        const linkedCache = path.join(tmp, "linked-cache");
        fs.symlinkSync(realCache, linkedCache, "dir");

        const out = execFileSync(
          process.execPath,
          [
            "--input-type=module",
            "-e",
            `import { installRegistry } from ${JSON.stringify(REGISTRY)};
             import { createRequire } from "node:module";
             const file = ${JSON.stringify(path.join(linkedCache, "rn.cjs"))};
             if (!installRegistry(file, ${JSON.stringify(project)})) throw new Error("not installed");
             const registry = createRequire(file)(file).__vitestNativeRegistry;
             process.stdout.write(registry.load());`,
          ],
          { encoding: "utf8", env: { ...process.env, VITEST_NATIVE_PLATFORM: "ios" } },
        );
        expect(out).toBe("deep");
      } finally {
        fs.rmSync(tmp, { recursive: true, force: true });
      }
    },
  );
});

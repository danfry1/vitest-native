import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import Module from "node:module";
import { afterAll, describe, expect, it } from "vitest";
import { installNitroProxy } from "../src/native/nitro.mjs";

// Nitro requires its own package.json from CommonJS that Node loaded through `import`.
// Node's JSON translator skips its require cache for a file already in Module._cache,
// so the proxy must read the version from disk, never require() it.
const root = fs.mkdtempSync(path.join(os.tmpdir(), "vn-nitro-proxy-"));
const manifest = path.join(root, "node_modules/react-native-nitro-modules/package.json");
fs.mkdirSync(path.dirname(manifest), { recursive: true });
fs.writeFileSync(path.join(root, "package.json"), "{}");
fs.writeFileSync(
  manifest,
  JSON.stringify({ name: "react-native-nitro-modules", version: "9.9.9" }),
);
afterAll(() => fs.rmSync(root, { recursive: true, force: true }));

describe("installNitroProxy", () => {
  it("reports the installed Nitro version without putting its manifest in Module._cache", () => {
    const g = globalThis as { NitroModulesProxy?: { version: string } };
    delete g.NitroModulesProxy;
    installNitroProxy(root);
    expect(g.NitroModulesProxy?.version).toBe("9.9.9");
    const cache = (Module as unknown as { _cache: Record<string, unknown> })._cache;
    expect(
      Object.keys(cache).some((key) => key === fs.realpathSync(manifest) || key === manifest),
    ).toBe(false);
    delete g.NitroModulesProxy;
  });
});

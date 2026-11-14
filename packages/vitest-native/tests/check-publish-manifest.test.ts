import { spawnSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { autoCorrections } from "../scripts/check-publish-manifest.mjs";

const packageRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const script = path.join(packageRoot, "scripts", "check-publish-manifest.mjs");

// npm's output for the 0.15.0 release's package.json, which listed the bin as "./dist/cli.mjs".
const NPM_11 = [
  'npm warn publish npm auto-corrected some errors in your package.json when publishing.  Please run "npm pkg fix" to address these errors.',
  "npm warn publish errors corrected:",
  'npm warn publish "bin[vitest-native]" script name dist/cli.mjs was invalid and removed',
  "npm notice",
  "npm notice 📦  vitest-native@0.15.0",
].join("\n");
const NPM_10 = [
  'npm warn publish npm auto-corrected some errors in your package.json when publishing.  Please run "npm pkg fix" to address these errors.',
  'npm warn publish "bin[vitest-native]" script name was cleaned',
  "npm notice 📦  vitest-native@0.15.0",
].join("\n");

describe("npm's publish-time manifest corrections", () => {
  it("finds the notice and every correction npm 11 and npm 10 list after it", () => {
    expect(autoCorrections(NPM_11)).toHaveLength(3);
    expect(autoCorrections(NPM_11).at(-1)).toContain('"bin[vitest-native]"');
    expect(autoCorrections(NPM_10)).toHaveLength(2);
    expect(autoCorrections(NPM_10).at(-1)).toContain("was cleaned");
  });

  it("finds nothing in a clean publish", () => {
    expect(autoCorrections("npm notice 📦  vitest-native@0.15.0\n+ vitest-native@0.15.0")).toEqual(
      [],
    );
  });

  it("the package's bin targets are already in the form npm publishes", () => {
    const manifest = JSON.parse(fs.readFileSync(path.join(packageRoot, "package.json"), "utf8"));
    for (const target of Object.values<string>(manifest.bin)) {
      // npm strips a leading "./" and uses forward slashes (@npmcli/package-json normalize).
      expect(target).not.toMatch(/^\.[/\\]|\\/);
    }
  });
});

describe("the publish-manifest check", () => {
  function check(bin: string) {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), "vn-publish-manifest-"));
    try {
      fs.mkdirSync(path.join(dir, "dist"));
      fs.writeFileSync(path.join(dir, "dist", "cli.mjs"), "#!/usr/bin/env node\n");
      fs.writeFileSync(
        path.join(dir, "package.json"),
        JSON.stringify({ name: "vn-check-fixture", version: "1.0.0", bin: { "vn-check": bin } }),
      );
      return spawnSync(process.execPath, [script, dir], { encoding: "utf8" });
    } finally {
      fs.rmSync(dir, { recursive: true, force: true });
    }
  }

  it("fails on a manifest npm would correct, naming the correction", { timeout: 60_000 }, () => {
    const result = check("./dist/cli.mjs");
    expect(result.status).toBe(1);
    expect(result.stderr).toContain('"bin[vn-check]"');
    expect(result.stderr).toContain("npm pkg fix");
  });

  it("passes a manifest npm publishes as written", { timeout: 60_000 }, () => {
    const result = check("dist/cli.mjs");
    expect(result.stderr).toBe("");
    expect(result.status).toBe(0);
  });
});

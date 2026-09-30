import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterAll, describe, expect, it } from "vitest";
// @ts-expect-error — internal runtime .mjs, intentionally not public API
import { buildRegistryFor, compileRegistryInChild } from "../src/native/registry-process.mjs";
// @ts-expect-error — internal runtime .mjs, intentionally not public API
import { registryKey } from "../src/native/registry.mjs";

const fixtureRoot = fs.mkdtempSync(path.join(os.tmpdir(), "vn-registry-process-"));
afterAll(() => fs.rmSync(fixtureRoot, { recursive: true, force: true }));

function compiler(name: string, source: string): string {
  const file = path.join(fixtureRoot, `${name}.mjs`);
  fs.writeFileSync(file, source);
  return file;
}

const respond = `
  import fs from "node:fs";
  const options = JSON.parse(fs.readFileSync(0, "utf8"));
  fs.writeSync(3, JSON.stringify({
    ok: true,
    registryFile: options.registryFile,
    received: options,
  }));
`;

describe("bounded registry compiler process", () => {
  it("keeps a production warm cache hit spawn-free", async () => {
    const root = fs.mkdtempSync(path.join(fixtureRoot, "warm-"));
    const nodeModules = path.join(root, "node_modules");
    fs.mkdirSync(nodeModules);
    const manifestFile = path.join(root, "package.json");
    fs.writeFileSync(manifestFile, JSON.stringify({ name: "warm-cache" }));
    const options = {
      projectRoot: root,
      platform: "ios",
      reactNativeVersion: "0.87.0",
      assetExts: ["png"],
      diagnostics: false,
    };
    const key = registryKey(options) as string;
    const registryDir = path.join(nodeModules, ".cache", "vitest-native", "registry");
    fs.mkdirSync(registryDir, { recursive: true });
    const registryFile = path.join(registryDir, `rn-ios-${key}.cjs`);
    fs.writeFileSync(registryFile, "module.exports = {};\n");
    const stat = fs.statSync(manifestFile);
    fs.writeFileSync(
      `${registryFile}.json`,
      JSON.stringify({ key, count: 1, manifest: [[manifestFile, stat.mtimeMs, stat.size]] }),
    );
    let compilerCalls = 0;

    const result = await buildRegistryFor(options, async () => {
      compilerCalls++;
      throw new Error("warm cache launched the compiler");
    });

    expect(result).toBe(registryFile);
    expect(compilerCalls).toBe(0);
  });

  it("uses a private protocol channel so compiler stdout cannot corrupt the result", async () => {
    const file = compiler(
      "success-with-stdout",
      `process.stdout.write("third-party compiler notice\\n");${respond}`,
    );
    const result = await compileRegistryInChild(file, { registryFile: "/cache/rn.cjs" });

    expect(result).toMatchObject({
      ok: true,
      registryFile: "/cache/rn.cjs",
      received: { registryFile: "/cache/rn.cjs" },
      heapMb: 96,
      attempts: 1,
    });
  });

  it("does not retry an ordinary compiler failure", async () => {
    const file = compiler(
      "ordinary-failure",
      `
        import fs from "node:fs";
        fs.readFileSync(0, "utf8");
        fs.writeSync(3, JSON.stringify({ ok: false, error: "bad transform" }));
        process.exitCode = 1;
      `,
    );
    const result = await compileRegistryInChild(file, {});

    expect(result).toMatchObject({
      ok: false,
      oom: false,
      error: "bad transform",
      heapMb: 96,
      attempts: 1,
    });
  });

  it("retries exactly once at the larger cap after a genuine V8 heap OOM", async () => {
    const file = compiler(
      "oom-then-success",
      `
        import fs from "node:fs";
        fs.readFileSync(0, "utf8");
        const heap = Number(process.execArgv[0].split("=")[1]);
        if (heap < 64) {
          process.stderr.write("FATAL ERROR: Reached heap limit Allocation failed - JavaScript heap out of memory\\n");
          process.exitCode = 1;
        } else {
          fs.writeSync(3, JSON.stringify({ ok: true, registryFile: "/cache/retry.cjs" }));
        }
      `,
    );
    const result = await compileRegistryInChild(file, {}, { initialHeapMb: 32, retryHeapMb: 64 });

    expect(result).toMatchObject({
      ok: true,
      registryFile: "/cache/retry.cjs",
      heapMb: 64,
      attempts: 2,
    });
  });

  it("kills and reports a compiler that exceeds its deadline", async () => {
    const file = compiler(
      "timeout",
      `
        import fs from "node:fs";
        fs.readFileSync(0, "utf8");
        setInterval(() => {}, 1_000);
      `,
    );
    const result = await compileRegistryInChild(file, {}, { timeoutMs: 100 });

    expect(result).toMatchObject({ ok: false, oom: false, attempts: 1 });
    expect(result.error).toContain("exceeded 100ms");
  });

  it("turns a synchronous spawn failure into a structured result", async () => {
    const result = await compileRegistryInChild(
      "ignored.mjs",
      {},
      {
        spawnProcess() {
          throw new Error("spawn unavailable");
        },
      },
    );

    expect(result).toMatchObject({
      ok: false,
      oom: false,
      error: "spawn unavailable",
      attempts: 1,
    });
  });
});

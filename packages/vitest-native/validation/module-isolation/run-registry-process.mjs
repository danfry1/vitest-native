/**
 * Production gate for bounded cold React Native registry compilation.
 *
 * It compares two fresh projects in fresh parent processes, proves the cache hit
 * remains an in-process lookup, then races two real compiler children against one
 * cache directory. The assertions are intentionally about discriminating contracts
 * (artifact equivalence, parent RSS, bounded retry protocol, atomic visibility), not
 * a publishable benchmark number from one machine.
 */
import { createRequire } from "node:module";
import { spawnSync } from "node:child_process";
import crypto from "node:crypto";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { buildRegistry } from "../../src/native/registry.mjs";
import { compileRegistryInChild } from "../../src/native/registry-process.mjs";

const here = path.dirname(fileURLToPath(import.meta.url));
const packageRoot = path.resolve(here, "../..");
const compilerFile = path.join(packageRoot, "src/native/registry-compiler.mjs");
const require = createRequire(path.join(packageRoot, "package.json"));
const temporaryRoots = [];
const optionsFor = (projectRoot) => ({
  projectRoot,
  platform: "ios",
  reactNativeVersion: require("react-native/package.json").version,
  assetExts: ["png", "jpg", "jpeg", "gif", "webp", "svg", "ttf"],
  diagnostics: false,
});

function gc() {
  for (let index = 0; index < 3; index++) globalThis.gc?.();
}

function packageDirectory(name) {
  return path.dirname(require.resolve(`${name}/package.json`));
}

function projectFixture(label) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), `vn-registry-${label}-`));
  temporaryRoots.push(root);
  const nodeModules = path.join(root, "node_modules");
  fs.mkdirSync(nodeModules);
  for (const name of ["@babel/core", "@react-native/babel-preset", "react", "react-native"]) {
    const destination = path.join(nodeModules, ...name.split("/"));
    fs.mkdirSync(path.dirname(destination), { recursive: true });
    fs.symlinkSync(
      packageDirectory(name),
      destination,
      process.platform === "win32" ? "junction" : "dir",
    );
  }
  fs.writeFileSync(
    path.join(root, "package.json"),
    `${JSON.stringify({ name: `registry-${label}`, private: true }, null, 2)}\n`,
  );
  return root;
}

function metadata(registryFile) {
  return JSON.parse(fs.readFileSync(`${registryFile}.json`, "utf8"));
}

function sha256(file) {
  return crypto.createHash("sha256").update(fs.readFileSync(file)).digest("hex");
}

async function measure(strategy, projectRoot) {
  const options = optionsFor(projectRoot);
  gc();
  const before = process.memoryUsage();
  const started = performance.now();
  let registryFile;
  let compiler = null;
  if (strategy === "in-process") {
    registryFile = buildRegistry({ ...options, failOnError: true });
  } else if (strategy === "child") {
    compiler = await compileRegistryInChild(compilerFile, options);
    if (!compiler.ok) throw new Error(`bounded compiler failed: ${compiler.error}`);
    registryFile = buildRegistry({ ...options, cacheOnly: true, failOnError: true });
  } else {
    throw new Error(`unknown measurement strategy: ${strategy}`);
  }
  const durationMs = Math.round(performance.now() - started);
  if (!registryFile) throw new Error(`${strategy} produced no registry`);
  gc();
  const afterGc = process.memoryUsage();
  const warmStarted = performance.now();
  const warmFile = buildRegistry({ ...options, cacheOnly: true, failOnError: true });
  const warmLookupMs = performance.now() - warmStarted;
  if (warmFile !== registryFile) throw new Error(`${strategy} warm lookup missed its registry`);
  const meta = metadata(registryFile);
  return {
    strategy,
    durationMs,
    warmLookupMs,
    before,
    afterGc,
    parentRssGrowth: afterGc.rss - before.rss,
    registryBytes: fs.statSync(registryFile).size,
    registrySha256: sha256(registryFile),
    count: meta.count,
    compiler,
  };
}

function measuredSubprocess(strategy, projectRoot) {
  const child = spawnSync(
    process.execPath,
    ["--expose-gc", fileURLToPath(import.meta.url), "--measure", strategy, projectRoot],
    { encoding: "utf8", maxBuffer: 2 * 1024 * 1024, timeout: 180_000 },
  );
  if (child.status !== 0) {
    throw new Error(
      `${strategy} measurement failed (${child.status ?? child.signal}):\n${child.stderr || child.stdout}`,
    );
  }
  return JSON.parse(child.stdout);
}

async function concurrentColdMiss() {
  const projectRoot = projectFixture("concurrent");
  const options = optionsFor(projectRoot);
  const results = await Promise.all([
    compileRegistryInChild(compilerFile, options),
    compileRegistryInChild(compilerFile, options),
  ]);
  const registryFile = buildRegistry({ ...options, cacheOnly: true, failOnError: true });
  if (!registryFile) {
    throw new Error(`concurrent compilers left no valid cache:\n${JSON.stringify(results)}`);
  }
  const registryDir = path.dirname(registryFile);
  const temporaryFiles = fs.readdirSync(registryDir).filter((file) => file.endsWith(".tmp"));
  return {
    results,
    count: metadata(registryFile).count,
    registrySha256: sha256(registryFile),
    temporaryFiles,
  };
}

if (process.argv[2] === "--measure") {
  const result = await measure(process.argv[3], process.argv[4]);
  process.stdout.write(JSON.stringify(result));
} else {
  try {
    const inProcess = measuredSubprocess("in-process", projectFixture("parent"));
    const child = measuredSubprocess("child", projectFixture("child"));
    const concurrent = await concurrentColdMiss();

    if (inProcess.count < 300 || child.count !== inProcess.count) {
      throw new Error(
        `registry graph changed across compiler owners (${inProcess.count} vs ${child.count})`,
      );
    }
    if (
      child.registryBytes !== inProcess.registryBytes ||
      child.registrySha256 !== inProcess.registrySha256
    ) {
      throw new Error(
        `registry artifact changed across compiler owners ` +
          `(${inProcess.registrySha256} vs ${child.registrySha256})`,
      );
    }
    if (concurrent.count !== inProcess.count) {
      throw new Error(
        `concurrent registry graph changed (${concurrent.count} vs ${inProcess.count})`,
      );
    }
    if (concurrent.registrySha256 !== inProcess.registrySha256) {
      throw new Error(`concurrent compiler published a different registry artifact`);
    }
    if (concurrent.temporaryFiles.length > 0) {
      throw new Error(
        `concurrent compilers left temp files: ${concurrent.temporaryFiles.join(", ")}`,
      );
    }
    const rssSaving = inProcess.afterGc.rss - child.afterGc.rss;
    if (rssSaving < 64 * 1024 * 1024) {
      throw new Error(
        `bounded child saved only ${Math.round(rssSaving / 1024 / 1024)} MiB parent RSS; ` +
          `expected at least 64 MiB`,
      );
    }
    if (child.durationMs > inProcess.durationMs * 2 + 500) {
      throw new Error(
        `bounded child was unexpectedly slow (${child.durationMs}ms vs ${inProcess.durationMs}ms)`,
      );
    }
    if (child.warmLookupMs > 100) {
      throw new Error(`warm cache lookup took ${child.warmLookupMs.toFixed(1)}ms`);
    }
    if (!concurrent.results.some((result) => result.ok)) {
      throw new Error(`neither concurrent compiler reported success`);
    }

    console.log(
      JSON.stringify(
        {
          verdict: "PASS",
          inProcess,
          child,
          rssSavingMiB: Math.round(rssSaving / 1024 / 1024),
          concurrent,
        },
        null,
        2,
      ),
    );
  } finally {
    for (const root of temporaryRoots) {
      fs.rmSync(root, { recursive: true, force: true });
    }
  }
}

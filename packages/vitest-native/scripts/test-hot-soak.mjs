import { spawnSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";

const packageRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const generatedName = `.vitest-native-hot-soak-${process.pid}`;
const generatedRoot = path.join(packageRoot, generatedName);
const require = createRequire(path.join(packageRoot, "package.json"));
const vitestRoot = path.dirname(require.resolve("vitest/package.json"));
const vitestEntry = path.join(vitestRoot, "vitest.mjs");
const bootPattern = /\[vitest-native\] hot worker boot/g;

function writeTestFiles(directory, count, prefix) {
  fs.mkdirSync(directory, { recursive: true });
  for (let index = 1; index <= count; index += 1) {
    const number = String(index).padStart(3, "0");
    fs.writeFileSync(
      path.join(directory, `${number}.test.ts`),
      `import { DeviceEventEmitter } from "react-native";
import { expect, it } from "vitest";

const globalKey = "__VN_GENERATED_HOT_SOAK__";
const envKey = "VITEST_NATIVE_GENERATED_HOT_SOAK";
const eventName = "vitest-native-generated-hot-soak";
const inheritedGlobal = (globalThis as Record<string, unknown>)[globalKey];
const inheritedEnv = process.env[envKey];
const inheritedListeners = DeviceEventEmitter.listenerCount(eventName);

(globalThis as Record<string, unknown>)[globalKey] = "${prefix}-${number}";
process.env[envKey] = "${prefix}-${number}";
DeviceEventEmitter.addListener(eventName, () => {});

it("isolates generated hot-runtime file ${number}", () => {
  expect(inheritedGlobal).toBeUndefined();
  expect(inheritedEnv).toBeUndefined();
  expect(inheritedListeners).toBe(0);
});
`,
    );
  }
}

function writeConfig(fileName, testDirectory, hotRuntime, workers) {
  fs.writeFileSync(
    path.join(generatedRoot, fileName),
    `import { defineConfig } from "vitest/config";
import { reactNative } from "../dist/index.mjs";

export default defineConfig({
  root: ${JSON.stringify(packageRoot)},
  plugins: [
    reactNative({
      diagnostics: true,
      engine: "native",
      hotRuntime: ${JSON.stringify(hotRuntime)},
    }),
  ],
  test: {
    environment: "node",
    include: [${JSON.stringify(`${generatedName}/${testDirectory}/*.test.ts`)}],
    fileParallelism: ${workers > 1},
    maxWorkers: ${workers},
    minWorkers: ${workers},
    sequence: {
      shuffle: false,
    },
  },
});
`,
  );
}

function runVitest(label, configName) {
  const startedAt = performance.now();
  const result = spawnSync(process.execPath, [vitestEntry, "run", "--config", configName], {
    cwd: generatedRoot,
    encoding: "utf8",
    env: process.env,
  });
  const output = `${result.stdout ?? ""}${result.stderr ?? ""}`;
  process.stdout.write(output);
  if (result.error) throw result.error;
  if (result.status !== 0) {
    throw new Error(`${label} exited with code ${result.status}`);
  }
  return {
    bootCount: output.match(bootPattern)?.length ?? 0,
    durationMs: Math.round(performance.now() - startedAt),
  };
}

try {
  const longDirectory = path.join(generatedRoot, "long");
  const recycleDirectory = path.join(generatedRoot, "recycle");
  writeTestFiles(longDirectory, 100, "long");
  writeTestFiles(recycleDirectory, 12, "recycle");
  writeConfig("long.config.mts", "long", true, 1);
  writeConfig("recycle.config.mts", "recycle", { memoryLimit: 1 }, 2);

  const longRun = runVitest("hot-runtime longevity soak", "long.config.mts");
  if (longRun.bootCount !== 1) {
    throw new Error(
      `hot-runtime longevity soak expected one worker boot, observed ${longRun.bootCount}`,
    );
  }

  const recycleRun = runVitest("hot-runtime recycling soak", "recycle.config.mts");
  if (recycleRun.bootCount <= 2) {
    throw new Error(
      `hot-runtime recycling soak expected more than two worker boots, observed ${recycleRun.bootCount}`,
    );
  }

  console.log(
    `\nHot-runtime soak passed: 100 files shared one worker in ${longRun.durationMs}ms; ` +
      `memory recycling produced ${recycleRun.bootCount} worker boots in ${recycleRun.durationMs}ms.`,
  );
} finally {
  fs.rmSync(generatedRoot, { force: true, recursive: true });
}

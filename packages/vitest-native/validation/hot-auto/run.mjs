import { spawnSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
const packageRoot = path.resolve(here, "../..");
const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), "vn-hot-auto-"));

function run(command, args, cwd, env = {}) {
  const result = spawnSync(command, args, {
    cwd,
    encoding: "utf8",
    env: { ...process.env, ...env },
  });
  const output = `${result.stdout ?? ""}${result.stderr ?? ""}`;
  process.stdout.write(result.stdout ?? "");
  process.stderr.write(result.stderr ?? "");
  if (result.error) throw result.error;
  if (result.status !== 0) {
    throw new Error(`${command} ${args.join(" ")} exited ${result.status}`);
  }
  return output;
}

function write(file, contents) {
  fs.writeFileSync(path.join(tempRoot, file), contents);
}

try {
  run("npm", ["pack", "--pack-destination", tempRoot], packageRoot);
  const packed = fs.readdirSync(tempRoot).find((file) => file.endsWith(".tgz"));
  if (packed === undefined) throw new Error("npm pack did not create a tarball");
  write(
    "package.json",
    `${JSON.stringify(
      {
        name: "vitest-native-hot-auto-gate",
        private: true,
        type: "module",
        dependencies: {
          "@babel/core": "^7.29.7",
          "@react-native/babel-preset": "0.87.0",
          react: "19.2.8",
          "react-native": "0.87.0",
          vite: "8.0.16",
          vitest: "4.1.10",
          "vitest-native": `file:${path.join(tempRoot, packed)}`,
        },
      },
      null,
      2,
    )}\n`,
  );
  run(
    "npm",
    ["install", "--ignore-scripts", "--no-audit", "--no-fund", "--legacy-peer-deps"],
    tempRoot,
  );

  write(
    "vitest.config.mjs",
    `
import { defineConfig } from "vitest/config";
import { reactNative } from "vitest-native";
import { jestCompatSetup, jestMockTransform } from "vitest-native/jest-compat";

const scenario = process.env.VN_HOT_AUTO_SCENARIO;
const migration = scenario === "migration";
const oneWorker = scenario === "one-worker";
const customPool = scenario === "custom-pool" || scenario === "default-custom-pool";
const latePool = scenario === "late-pool";
const lateMigration = scenario === "late-migration";

const latePoolPlugin = {
  name: "fixture:late-pool",
  config() {
    return { test: { pool: "forks" } };
  },
};

const lateMigrationPlugin = {
  name: "fixture:late-migration",
  config() {
    return { test: { setupFiles: [jestCompatSetup] } };
  },
};

export default defineConfig({
  plugins: [
    reactNative(
      scenario === "default" || scenario === "default-custom-pool"
        ? { engine: "native" }
        : { engine: "native", hotRuntime: "auto" },
    ),
    ...(migration ? [jestMockTransform()] : []),
    ...(latePool ? [latePoolPlugin] : []),
    ...(lateMigration ? [lateMigrationPlugin] : []),
  ],
  test: {
    include: [migration ? "migration-*.test.mjs" : "basic-*.test.mjs"],
    globals: migration,
    ...(migration ? { setupFiles: [jestCompatSetup] } : {}),
    ...(oneWorker ? { fileParallelism: false, maxWorkers: 1 } : { maxWorkers: 2 }),
    ...(customPool ? { pool: "forks" } : {}),
  },
});
`,
  );

  for (let index = 0; index < 4; index++) {
    write(
      `basic-${index}.test.mjs`,
      `
import { expect, test } from "vitest";
import { Platform } from "react-native";

test("auto selection ${index}", () => {
  const selected = process.env.VITEST_NATIVE_MEMORY_PLAN !== undefined;
  expect(selected).toBe(["enabled", "default", "late-migration"].includes(process.env.VN_HOT_AUTO_SCENARIO));
  expect(Platform.OS).toBe("ios");
});
`,
    );
  }
  write("migration-value.mjs", `export default "real";\n`);
  write(
    "migration-0.test.mjs",
    `
import value from "./migration-value.mjs";

jest.mock("./migration-value.mjs", () => "mocked");

test("migration config runs hot, with jest.mock applied", () => {
  expect(value).toBe("mocked");
  expect(process.env.VITEST_NATIVE_MEMORY_PLAN).toBeDefined();
});
`,
  );

  for (const [scenario, reason] of [
    ["enabled", null],
    ["one-worker", "one unrecyclable worker"],
    // Jest-migration suites are admitted since the hot runtime resets before user setup.
    ["migration", null],
    ["custom-pool", "'forks' is explicitly configured"],
    ["late-pool", "'forks' is explicitly configured"],
    ["late-migration", null],
    // hotRuntime left unset: 'auto' by default, and a fallback it was not asked for is quiet.
    ["default", null],
    ["default-custom-pool", "quiet"],
  ]) {
    const output = run(
      process.execPath,
      [path.join(tempRoot, "node_modules/vitest/vitest.mjs"), "run"],
      tempRoot,
      { VN_HOT_AUTO_SCENARIO: scenario },
    );
    if (reason === null && output.includes("kept default isolation")) {
      throw new Error("safe auto configuration unexpectedly declined hotRuntime");
    }
    if (reason === "quiet") {
      if (output.includes("kept default isolation")) {
        throw new Error(`${scenario} reported a fallback the user did not ask about`);
      }
      continue;
    }
    if (reason !== null && !output.includes(reason)) {
      throw new Error(`${scenario} fallback did not report ${JSON.stringify(reason)}`);
    }
  }

  console.log("Packed hotRuntime:'auto' enable/fallback gate passed.");
} finally {
  if (process.env.VN_KEEP_HOT_AUTO === "1") {
    console.log(`retained hot-auto fixture: ${tempRoot}`);
  } else {
    fs.rmSync(tempRoot, { recursive: true, force: true });
  }
}

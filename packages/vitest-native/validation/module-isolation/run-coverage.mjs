import { spawnSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
const packageRoot = path.resolve(here, "../..");
const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), "vn-module-isolation-coverage-"));
const fileCount = Number(process.argv[2] ?? 40);

function run(command, args, cwd, env = {}) {
  const result = spawnSync(command, args, {
    cwd,
    encoding: "utf8",
    env: { ...process.env, ...env },
  });
  process.stdout.write(result.stdout ?? "");
  process.stderr.write(result.stderr ?? "");
  if (result.error) throw result.error;
  if (result.status !== 0) {
    throw new Error(`${command} ${args.join(" ")} exited ${result.status}`);
  }
}

function packNative() {
  run("npm", ["pack", "--ignore-scripts", "--pack-destination", tempRoot], packageRoot);
  const tarball = fs.readdirSync(tempRoot).find((file) => file.endsWith(".tgz"));
  if (!tarball) throw new Error("npm pack did not produce a vitest-native tarball");
  return path.join(tempRoot, tarball);
}

function write(file, contents) {
  fs.writeFileSync(path.join(tempRoot, file), contents);
}

function normalizedCoverage(provider, mode) {
  const file = path.join(tempRoot, `coverage-${provider}-${mode}`, "coverage-final.json");
  const report = JSON.parse(fs.readFileSync(file, "utf8"));
  const entries = Object.values(report);
  if (entries.length !== 1) {
    throw new Error(
      `${provider}/${mode} coverage contains ${entries.length} files instead of subject.mjs only`,
    );
  }
  const [{ path: _path, ...coverage }] = entries;
  return coverage;
}

function functionCount(coverage, name) {
  const entry = Object.entries(coverage.fnMap).find(([, value]) => value.name === name);
  if (!entry) throw new Error(`coverage has no function named ${name}`);
  return coverage.f[entry[0]];
}

try {
  const nativeTarball = packNative();
  write(
    "package.json",
    `${JSON.stringify(
      {
        name: "vitest-native-coverage-probe",
        private: true,
        type: "module",
        dependencies: {
          "@babel/core": "^7.29.7",
          "@react-native/babel-preset": "0.87.0",
          "@vitest/coverage-istanbul": "4.1.10",
          "@vitest/coverage-v8": "4.1.10",
          react: "19.2.8",
          "react-native": "0.87.0",
          vite: "8.0.16",
          vitest: "4.1.10",
          "vitest-native": `file:${nativeTarball}`,
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
    "subject.mjs",
    `import { Platform } from "react-native";

let calls = 0;

export function classify(value) {
  calls += 1;
  if (value > 0) return "positive";
  if (value < 0) return "negative";
  return "zero";
}

export function callCount() {
  return calls;
}

export function platformLabel() {
  return Platform.select({ ios: "native-ios", default: "other" });
}

export function deliberatelyUntested() {
  return "coverage must retain this zero";
}
`,
  );

  for (let index = 0; index < fileCount; index++) {
    const value = (index % 3) - 1;
    const expected = value < 0 ? "negative" : value > 0 ? "positive" : "zero";
    write(
      `${String(index).padStart(3, "0")}.coverage.test.mjs`,
      `import { expect, test } from "vitest";
import { callCount, classify, platformLabel } from "./subject.mjs";

test("fresh module and branch ${index}", () => {
  expect(callCount()).toBe(0);
  expect(classify(${value})).toBe(${JSON.stringify(expected)});
  expect(callCount()).toBe(1);
  expect(platformLabel()).toBe("native-ios");
});
`,
    );
  }

  write(
    "vitest.config.mjs",
    `import { defineConfig } from "vitest/config";
import { reactNative } from "vitest-native";

const mode = process.env.VN_COVERAGE_MODE;
const provider = process.env.VN_COVERAGE_PROVIDER;

export default defineConfig({
  plugins: [reactNative({ engine: "native", hotRuntime: mode === "hot" })],
  test: {
    environment: "node",
    include: ["*.coverage.test.mjs"],
    maxWorkers: 2,
    minWorkers: 2,
    coverage: {
      enabled: true,
      provider,
      include: ["subject.mjs"],
      reporter: ["json"],
      reportsDirectory: "coverage-" + provider + "-" + mode,
    },
  },
});
`,
  );

  for (const provider of ["v8", "istanbul"]) {
    for (const mode of ["default", "hot"]) {
      run(
        process.execPath,
        [path.join(tempRoot, "node_modules/vitest/vitest.mjs"), "run"],
        tempRoot,
        { VN_COVERAGE_MODE: mode, VN_COVERAGE_PROVIDER: provider },
      );
    }

    const baseline = normalizedCoverage(provider, "default");
    const hot = normalizedCoverage(provider, "hot");
    if (JSON.stringify(hot) !== JSON.stringify(baseline)) {
      throw new Error(`${provider} hot coverage map/counts differ from default isolation`);
    }
    for (const [name, expected] of [
      ["classify", fileCount],
      ["callCount", fileCount * 2],
      ["platformLabel", fileCount],
      ["deliberatelyUntested", 0],
    ]) {
      const count = functionCount(hot, name);
      if (count !== expected) {
        throw new Error(`${provider} ${name} coverage count was ${count}; expected ${expected}`);
      }
    }
  }
  console.log(
    `Packed RN V8 + Istanbul coverage gate passed: ${fileCount} files, exact default/hot map parity.`,
  );
} finally {
  if (process.env.VN_KEEP_MODULE_ISOLATION === "1") {
    console.log(`retained coverage fixture: ${tempRoot}`);
  } else {
    fs.rmSync(tempRoot, { recursive: true, force: true });
  }
}

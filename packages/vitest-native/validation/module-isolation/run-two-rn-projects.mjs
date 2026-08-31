import { execFileSync, spawnSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
const packageRoot = path.resolve(here, "../..");
const vitestRoot = path.resolve(
  process.argv[2] ?? "/private/tmp/vitest-module-isolation-upstream",
);
const productionHot = process.env.VN_TWO_RN_RUNTIME === "hot";
const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), "vn-module-isolation-projects-"));

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

function pack(command, args, cwd) {
  const before = new Set(fs.readdirSync(tempRoot));
  run(command, args, cwd);
  const tarball = fs
    .readdirSync(tempRoot)
    .filter((file) => file.endsWith(".tgz") && !before.has(file))
    .map((file) => path.join(tempRoot, file))[0];
  if (!tarball) throw new Error(`No tarball produced by ${command}`);
  return tarball;
}

function writeJson(file, value) {
  fs.writeFileSync(file, `${JSON.stringify(value, null, 2)}\n`);
}

function projectTest(expectedVersion, index) {
  return `
import fs from "node:fs";
import { createRequire } from "node:module";
import { expect, test } from "vitest";
import { Platform } from "react-native";

const require = createRequire(import.meta.url);
const version = require("react-native/package.json").version;

test("loads project-owned React Native ${index}", () => {
  expect(version).toBe(${JSON.stringify(expectedVersion)});
  expect(Platform.OS).toBe("ios");
  expect(Platform.constants.reactNativeVersion.minor).toBe(${Number(expectedVersion.split(".")[1])});
  globalThis.__vnProjectPlatform ??= Platform;
  expect(Platform).toBe(globalThis.__vnProjectPlatform);
  fs.appendFileSync(new URL("./observed.txt", import.meta.url), version + "\\n");
});
`;
}

try {
  const vitestDependency = productionHot
    ? "4.1.10"
    : `file:${pack(
        "pnpm",
        ["pack", "--pack-destination", tempRoot],
        path.join(vitestRoot, "packages/vitest"),
      )}`;
  const nativeTarball = pack(
    "npm",
    ["pack", "--pack-destination", tempRoot],
    packageRoot,
  );

  writeJson(path.join(tempRoot, "package.json"), {
    name: "vitest-native-two-rn-projects",
    private: true,
    type: "module",
    dependencies: {
      react: "19.2.8",
      vite: "8.0.16",
      vitest: vitestDependency,
      "vitest-native": `file:${nativeTarball}`,
    },
  });
  run(
    "npm",
    ["install", "--ignore-scripts", "--no-audit", "--no-fund", "--legacy-peer-deps"],
    tempRoot,
  );

  const projects = [
    { name: "rn-081", rn: "0.81.5", react: "19.1.0" },
    { name: "rn-087", rn: "0.87.0", react: "19.2.8" },
  ];
  for (const project of projects) {
    const root = path.join(tempRoot, project.name);
    fs.mkdirSync(root);
    writeJson(path.join(root, "package.json"), {
      name: project.name,
      private: true,
      type: "module",
      dependencies: {
        "@babel/core": "^7.29.7",
        "@react-native/babel-preset": project.rn,
        react: project.react,
        "react-native": project.rn,
      },
    });
    run(
      "npm",
      ["install", "--ignore-scripts", "--no-audit", "--no-fund", "--legacy-peer-deps"],
      root,
    );
    fs.writeFileSync(
      path.join(root, "a-version.test.mjs"),
      projectTest(project.rn, 1),
    );
    fs.writeFileSync(
      path.join(root, "b-version.test.mjs"),
      projectTest(project.rn, 2),
    );
  }

  fs.writeFileSync(
    path.join(tempRoot, "vitest.config.mjs"),
    `
import path from "node:path";
import { defineConfig } from "vitest/config";
import { reactNative } from "vitest-native";

const project = name => ({
  root: path.join(import.meta.dirname, name),
  plugins: [reactNative({
    engine: "native",
    platform: "ios",
    hotRuntime: ${productionHot ? "{ allowUnboundedMemory: true }" : "false"},
  })],
  test: {
    name,
    ${productionHot ? "" : 'isolate: "modules",'}
    include: ["*.test.mjs"],
    fileParallelism: false,
    maxWorkers: 1,
    minWorkers: 1,
  },
});

export default defineConfig({
  test: { projects: [project("rn-081"), project("rn-087")] },
});
`,
  );

  const installedVersion = execFileSync(
    process.execPath,
    ["-p", "require('./node_modules/vitest/package.json').version"],
    { cwd: tempRoot, encoding: "utf8" },
  ).trim();
  console.log(`${productionHot ? "production-hot" : "module-isolation"} Vitest: ${installedVersion}`);
  run(
    process.execPath,
    [path.join(tempRoot, "node_modules/vitest/vitest.mjs"), "run"],
    tempRoot,
    { VITEST_NATIVE_DIAGNOSTICS: "true" },
  );

  for (const project of projects) {
    const observed = fs
      .readFileSync(path.join(tempRoot, project.name, "observed.txt"), "utf8")
      .trim()
      .split("\n");
    if (observed.length !== 2 || observed.some((version) => version !== project.rn)) {
      throw new Error(`${project.name} observed the wrong React Native graph: ${observed}`);
    }
  }
  console.log(
    `Two-project, two-React-Native-version ${
      productionHot ? "production-hot" : "module-isolation"
    } gate passed.`,
  );
} finally {
  if (process.env.VN_KEEP_MODULE_ISOLATION === "1") {
    console.log(`retained two-project fixture: ${tempRoot}`);
  } else {
    fs.rmSync(tempRoot, { recursive: true, force: true });
  }
}

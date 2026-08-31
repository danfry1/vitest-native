// Packed production-hot gate under real Linux cgroup limits.
//
// This is deliberately not a routine unit test: it builds a Linux consumer in a
// Docker volume, installs the packed package, then proves both sides of the memory
// contract. 512 MiB and 1 GiB must fail during config with our useful error rather
// than an OOM; 2 GiB must execute an RNTL-heavy suite and recycle successfully.
import { execFileSync, spawnSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { stripVTControlCharacters } from "node:util";

const here = path.dirname(fileURLToPath(import.meta.url));
const packageRoot = path.resolve(here, "../..");
const scaleRoot = path.resolve(here, "../idiomatic/scale");
const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), "vn-cgroup-hot-"));
const image = process.env.VN_CGROUP_NODE_IMAGE ?? "node:22-bookworm-slim";

function docker(args, options = {}) {
  return spawnSync("docker", args, {
    encoding: "utf8",
    maxBuffer: 32 * 1024 * 1024,
    ...options,
  });
}

function combined(result) {
  return `${result.stdout ?? ""}\n${result.stderr ?? ""}`;
}

function assertDockerResult(result, label) {
  if (result.error) throw result.error;
  if (result.signal)
    throw new Error(`${label} terminated by ${result.signal}\n${combined(result)}`);
}

function containerArgs(memory, command) {
  return [
    "run",
    "--rm",
    `--memory=${memory}`,
    `--memory-swap=${memory}`,
    "--cpus=4",
    "--volume",
    `${tempRoot}:/work`,
    "--workdir",
    "/work",
    image,
    ...command,
  ];
}

function runConstrained(memory) {
  return docker(
    containerArgs(memory, [
      "node",
      "--expose-gc",
      "./node_modules/vitest/vitest.mjs",
      "run",
      "--config",
      "vitest.config.mjs",
      "--reporter=dot",
    ]),
  );
}

try {
  const packJson = execFileSync("npm", ["pack", "--json", "--pack-destination", tempRoot], {
    cwd: packageRoot,
    encoding: "utf8",
  });
  const packed = JSON.parse(packJson)[0]?.filename;
  if (!packed) throw new Error("npm pack did not report a tarball");

  fs.writeFileSync(
    path.join(tempRoot, "package.json"),
    `${JSON.stringify(
      {
        name: "vitest-native-cgroup-hot-gate",
        private: true,
        type: "module",
        dependencies: {
          "@babel/core": "^7.29.7",
          "@react-native/babel-preset": "0.87.0",
          "@react-navigation/native": "7.3.14",
          "@react-navigation/native-stack": "7.18.6",
          "@testing-library/react-native": "14.0.0",
          react: "19.2.8",
          "react-native": "0.87.0",
          "react-native-safe-area-context": "5.8.0",
          "react-native-screens": "4.25.2",
          "react-test-renderer": "19.2.8",
          "resident-singleton": "file:./resident-singleton",
          "test-renderer": "^1.2.0",
          vite: "8.2.0",
          vitest: "4.1.10",
          "vitest-native": `file:./${packed}`,
        },
      },
      null,
      2,
    )}\n`,
  );
  fs.mkdirSync(path.join(tempRoot, "resident-singleton"));
  fs.writeFileSync(
    path.join(tempRoot, "resident-singleton/package.json"),
    '{"name":"resident-singleton","version":"1.0.0","main":"index.js"}\n',
  );
  fs.writeFileSync(
    path.join(tempRoot, "resident-singleton/index.js"),
    `const writes = [];
module.exports = { record: value => writes.push(value), count: () => writes.length };
`,
  );
  fs.copyFileSync(path.join(scaleRoot, "generate.mjs"), path.join(tempRoot, "generate.mjs"));
  fs.copyFileSync(path.join(scaleRoot, "sharedStore.ts"), path.join(tempRoot, "sharedStore.ts"));
  execFileSync(process.execPath, [path.join(tempRoot, "generate.mjs"), "360"], {
    cwd: tempRoot,
    stdio: "inherit",
  });
  fs.writeFileSync(
    path.join(tempRoot, "vitest.config.mjs"),
    `import path from "node:path";
import { defineConfig } from "vitest/config";
import { reactNative } from "vitest-native";

class AlphabeticalSequencer {
  sort(files) { return [...files].sort((a, b) => a.moduleId.localeCompare(b.moduleId)); }
  shard(files) { return files; }
}

export default defineConfig({
  plugins: [reactNative({
    engine: "native",
    diagnostics: true,
    hotRuntime: { memoryLimit: 96 * 1024 * 1024 },
  })],
  test: {
    environment: "node",
    // Deliberately exceed the 2 GiB admission plan. This proves the cap survives
    // Vite's real config merge rather than merely looking correct in the plugin's
    // unit-level return value.
    maxWorkers: 8,
    fileParallelism: true,
    sequence: { sequencer: AlphabeticalSequencer, shuffle: false },
    include: [path.join(import.meta.dirname, "generated/*.test.tsx")],
  },
});
`,
  );

  // Install outside the constrained runs. The gate measures the package runtime,
  // not npm's dependency resolver, and the volume gives every run the same Linux
  // node_modules tree.
  const install = docker([
    "run",
    "--rm",
    "--cpus=4",
    "--volume",
    `${tempRoot}:/work`,
    "--workdir",
    "/work",
    image,
    "npm",
    "install",
    "--ignore-scripts",
    "--no-audit",
    "--no-fund",
    "--legacy-peer-deps",
  ]);
  assertDockerResult(install, "container install");
  if (install.status !== 0) throw new Error(`container install failed\n${combined(install)}`);

  for (const memory of ["512m", "1g"]) {
    const result = runConstrained(memory);
    assertDockerResult(result, `${memory} fail-closed gate`);
    const output = combined(result);
    if (result.status === 0 || !output.includes("HOT_MEMORY_UNBOUNDED")) {
      throw new Error(
        `${memory} did not fail with HOT_MEMORY_UNBOUNDED before registry compilation\n${output}`,
      );
    }
    if (result.status === 137) {
      throw new Error(`${memory} was OOM-killed instead of failing closed\n${output}`);
    }
    console.log(`${memory}: failed closed with HOT_MEMORY_UNBOUNDED (exit ${result.status})`);
  }

  const bounded = runConstrained("2g");
  assertDockerResult(bounded, "2g bounded hot gate");
  const boundedOutput = combined(bounded);
  const boundedPlain = stripVTControlCharacters(boundedOutput);
  if (bounded.status !== 0) {
    const tail = boundedOutput.split("\n").slice(-120).join("\n");
    throw new Error(`2g bounded hot gate failed (exit ${bounded.status})\n${tail}`);
  }
  for (const evidence of [
    "effective limit: 2048 MiB (constrained)",
    "workers requested/admitted/selected: 8 / 4 / 4",
    "hotRuntime capped maxWorkers from 8 to 4",
    "recycling hot worker after",
    "Test Files  405 passed (405)",
  ]) {
    if (!boundedPlain.includes(evidence)) {
      throw new Error(
        `2g bounded hot gate did not report ${JSON.stringify(evidence)}\n${boundedOutput}`,
      );
    }
  }
  const resultLine = boundedPlain
    .split("\n")
    .find((line) => /Test Files\s+\d+ passed/.test(line.trim()));
  console.log(`2g: bounded packed RN/RNTL run passed and recycled (${resultLine?.trim() ?? "ok"})`);
} finally {
  if (process.env.VN_KEEP_CGROUP_HOT === "1") {
    console.log(`retained cgroup fixture: ${tempRoot}`);
  } else {
    fs.rmSync(tempRoot, { recursive: true, force: true });
  }
}

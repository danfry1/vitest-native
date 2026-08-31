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
const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), "vn-module-isolation-hot-"));

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

function packedTarball(command, args, cwd) {
  run(command, args, cwd);
  const tarballs = fs
    .readdirSync(tempRoot)
    .filter((file) => file.endsWith(".tgz"))
    .map((file) => path.join(tempRoot, file));
  return tarballs.sort((left, right) => fs.statSync(right).mtimeMs - fs.statSync(left).mtimeMs)[0];
}

try {
  const vitestTarball = packedTarball(
    "pnpm",
    ["pack", "--pack-destination", tempRoot],
    path.join(vitestRoot, "packages/vitest"),
  );
  const nativeTarball = packedTarball(
    "npm",
    ["pack", "--pack-destination", tempRoot],
    packageRoot,
  );

  fs.writeFileSync(
    path.join(tempRoot, "package.json"),
    JSON.stringify(
      {
        name: "vitest-native-module-isolation-hot-shape",
        private: true,
        type: "module",
        dependencies: {
          "@babel/core": "^7.29.7",
          "@react-native/babel-preset": "0.87.0",
          react: "19.2.8",
          "react-native": "0.87.0",
          "resident-singleton": `file:${path.join(
            packageRoot,
            "tests-native/fixtures/resident-singleton",
          )}`,
          vite: "8.0.11",
          vitest: `file:${vitestTarball}`,
          "vitest-native": `file:${nativeTarball}`,
        },
      },
      null,
      2,
    ),
  );

  fs.cpSync(path.join(packageRoot, "tests-native/hot-isolation"), path.join(tempRoot, "hot-isolation"), {
    recursive: true,
  });
  for (const file of [
    "bootstrap.mjs",
    "install-hot-after-setup.mjs",
    "runner.mjs",
    "vitest.hot-shape.mts",
  ]) {
    fs.copyFileSync(path.join(here, file), path.join(tempRoot, file));
  }

  run(
    "npm",
    ["install", "--ignore-scripts", "--no-audit", "--no-fund", "--legacy-peer-deps"],
    tempRoot,
  );
  const installedVersion = execFileSync(
    process.execPath,
    ["-p", "require('./node_modules/vitest/package.json').version"],
    { cwd: tempRoot, encoding: "utf8" },
  ).trim();
  console.log(`module-isolation Vitest: ${installedVersion}`);
  run(
    process.execPath,
    [path.join(tempRoot, "node_modules/vitest/vitest.mjs"), "run", "--config", "vitest.hot-shape.mts"],
    tempRoot,
    { VITEST_NATIVE_DIAGNOSTICS: "true" },
  );
  console.log("Native hot-shape module-isolation gate passed.");
} finally {
  if (process.env.VN_KEEP_MODULE_ISOLATION === "1") {
    console.log(`retained module-isolation fixture: ${tempRoot}`);
  } else {
    fs.rmSync(tempRoot, { recursive: true, force: true });
  }
}

import { spawnSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const packageRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const fixturesRoot = path.join(packageRoot, "consumer-tests");
const requested = process.argv.slice(2);
const fixtures = requested.length ? requested : ["bare", "current-rn"];
const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), "vn-selective-matrix-"));
console.log(`matrix temp root: ${tempRoot}`);

const asImport = (file) => JSON.stringify(pathToFileURL(file).href);
const local = (...parts) => path.join(packageRoot, ...parts);

function run(command, args, cwd) {
  const result = spawnSync(command, args, {
    cwd,
    encoding: "utf8",
    env: {
      ...process.env,
      npm_config_audit: "false",
      npm_config_fund: "false",
      npm_config_ignore_scripts: "true",
    },
  });
  const output = `${result.stdout ?? ""}${result.stderr ?? ""}`;
  process.stdout.write(output);
  if (result.error) throw result.error;
  if (result.status !== 0) throw new Error(`${command} ${args.join(" ")} exited ${result.status}`);
}

function writeExperiment(root, { isExpo, isRouter }) {
  const suite = path.join(root, "selective-experiment");
  fs.mkdirSync(suite, { recursive: true });
  fs.writeFileSync(
    path.join(suite, "render.test.tsx"),
    `import React from "react";
import { render, screen } from "@testing-library/react-native";
import { Text, View } from "react-native";
import { expect, test } from "vitest";

test("renders through the installed RN and RNTL pair", () => {
  render(<View testID="root"><Text>matrix render</Text></View>);
  expect(screen.getByTestId("root").type).toBe("RCTView");
  expect(screen.getByText("matrix render")).toBeTruthy();
});
`,
  );

  if (isRouter) {
    fs.writeFileSync(
      path.join(root, "route-dependency.ts"),
      `export const routeLabel = "real route dependency";\n`,
    );
    fs.writeFileSync(
      path.join(root, "app/mocked.tsx"),
      `import { Text } from "react-native";
import { routeLabel } from "../route-dependency";
export default function MockedRoute() { return <Text>{routeLabel}</Text>; }
`,
    );
    fs.writeFileSync(
      path.join(root, "router-tests/route-a-mock.test.tsx"),
      `import { renderRouter, screen } from "expo-router/testing-library";
import { expect, test, vi } from "vitest";
vi.mock("../route-dependency", () => ({ routeLabel: "mocked route dependency" }));
test("file-system routes honor a test-file mock", () => {
  renderRouter("./app", { initialUrl: "/mocked" });
  expect(screen.getByText("mocked route dependency")).toBeTruthy();
});
`,
    );
    fs.writeFileSync(
      path.join(root, "router-tests/route-b-unmocked.test.tsx"),
      `import { renderRouter, screen } from "expo-router/testing-library";
import { expect, test } from "vitest";
test("the next file sees the real route dependency", () => {
  renderRouter("./app", { initialUrl: "/mocked" });
  expect(screen.getByText("real route dependency")).toBeTruthy();
});
`,
    );
  }
  fs.writeFileSync(
    path.join(suite, "mock.test.ts"),
    `import { expect, test, vi } from "vitest";
vi.mock("react-native", async (importOriginal) => ({
  ...(await importOriginal()),
  Platform: { OS: "matrix-mock" },
}));
import { Platform } from "react-native";
test("partial mock overlays the persistent actual", () => expect(Platform.OS).toBe("matrix-mock"));
`,
  );
  fs.writeFileSync(
    path.join(suite, "actual.test.ts"),
    `import { expect, test } from "vitest";
import ReactNative, { Platform } from "react-native";
test("another file receives the unmocked persistent actual", () => {
  expect(Platform.OS).toBe("ios");
  expect(ReactNative).toBe(globalThis.__vitest_native_selective_persistence_rn__);
});
`,
  );

  fs.writeFileSync(
    path.join(root, "vitest.selective.config.mts"),
    `import { defineConfig } from "vitest/config";
import { getPlatformExtensions } from ${asImport(local("src/resolve.ts"))};
import { commonJsReactNativeBackToVitest } from ${asImport(local("validation/single-graph/optimizer.mts"))};
import { singleGraphReactNative } from ${asImport(local("validation/single-graph/plugin.mts"))};
${
  isExpo
    ? `import { expo, gestureHandler, reanimated, safeAreaContext, screens, worklets } from ${asImport(local("dist/presets.mjs"))};
import { selectivePresetModules } from ${asImport(local("validation/selective-persistence/presets.mts"))};`
    : ""
}
${isRouter ? `import { jestMockTransform } from ${asImport(local("dist/jest-compat.mjs"))};` : ""}

export default defineConfig({
  plugins: [${isExpo ? "selectivePresetModules([expo(), gestureHandler(), reanimated(), safeAreaContext(), screens(), worklets()])," : ""} singleGraphReactNative({
    capsule: true,
    namedCapsuleExports: true,
    bridgeNodeRequire: true,
    virtualizeDeepThroughCapsule: true,
    promoteRequiresFrom: ${isRouter ? '["expo-router", "expo"]' : "[]"},
    metroResolveFrom: ${isRouter ? '["expo-router", "expo", "expo-modules-core"]' : "[]"},
    detectEcosystem: ${isRouter ? "true" : "false"},
    requireNamespacePackages: ${isRouter ? '["react-native-reanimated", "react-native-worklets", "react-native-gesture-handler", "react-native-safe-area-context", "react-native-screens", "expo-constants", "expo-font", "expo-asset", "expo-splash-screen", "expo-linking", "expo-status-bar"]' : "[]"},
  })${isRouter ? ", jestMockTransform()" : ""}],
  resolve: {
    ${
      isRouter
        ? `alias: {
      "@jest/globals": ${JSON.stringify(local("dist/jest-compat/jest-globals.mjs"))},
      "@testing-library/jest-native/extend-expect": ${JSON.stringify(local("dist/jest-compat/noop.mjs"))},
    },`
        : ""
    }
    conditions: ["react-native"],
    extensions: getPlatformExtensions("ios"),
    mainFields: ["react-native", "module", "jsnext:main", "jsnext"],
    dedupe: ["react", "react-test-renderer", "test-renderer", "react-is", "vitest"],
  },
  ssr: { resolve: { conditions: ["react-native"], mainFields: ["react-native", "module", "jsnext:main", "jsnext"] } },
  test: {
    environment: "node",
    globals: true,
    isolate: false,
    maxWorkers: 1,
    minWorkers: 1,
    fileParallelism: false,
    include: ["selective-experiment/*.test.{ts,tsx}"${isExpo ? ', "src/packed-expo.test.tsx"' : ""}${isRouter ? ', "router-tests/**/*.test.tsx"' : ""}],
    setupFiles: [${JSON.stringify(local("validation/selective-persistence/setup.mts"))}${isExpo ? `, ${JSON.stringify(local("validation/selective-persistence/presets-setup.mts"))}` : ""}${isRouter ? `, ${JSON.stringify(local("dist/jest-compat/setup.mjs"))}` : ""}],
    runner: ${JSON.stringify(local("validation/selective-persistence/runner.mjs"))},
    server: { deps: { inline: true } },
    deps: { optimizer: { ssr: {
      enabled: true,
      include: ["@testing-library/react-native"],
      exclude: ["react-native"${isRouter ? ', "expo", "react-native-reanimated", "react-native-worklets", "react-native-gesture-handler", "react-native-safe-area-context", "react-native-screens", "expo-constants", "expo-font", "expo-asset", "expo-splash-screen", "expo-linking", "expo-status-bar"' : ""}],
      rolldownOptions: { plugins: [commonJsReactNativeBackToVitest()] },
    } } },
  },
});
`,
  );
}

try {
  for (const fixture of fixtures) {
    const root = path.join(tempRoot, fixture);
    const sourceFixture = fixture === "expo-router" ? "expo" : fixture;
    const isExpo = sourceFixture === "expo";
    const isRouter = fixture === "expo-router";
    fs.cpSync(path.join(fixturesRoot, sourceFixture), root, { recursive: true });
    writeExperiment(root, { isExpo, isRouter });
    console.log(`\n── selective persistence: ${fixture} ──`);
    run("npm", ["install"], root);
    run(
      process.execPath,
      [
        path.join(root, "node_modules/vitest/vitest.mjs"),
        "run",
        "--config",
        "vitest.selective.config.mts",
      ],
      root,
    );
  }
  console.log("\nSelective-persistence installed-version matrix passed.");
} finally {
  if (process.env.VN_KEEP_SELECTIVE_MATRIX === "1") {
    console.log(`retained matrix temp root: ${tempRoot}`);
  } else {
    fs.rmSync(tempRoot, { recursive: true, force: true });
  }
}

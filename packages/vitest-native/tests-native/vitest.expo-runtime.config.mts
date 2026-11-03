// `reactNative({ expo: { runtime } })` against the installed expo, expo-constants and
// expo-modules-core, one Vitest project per runtime, under the stock runtime
// (--mode stock) and the hot runtime (--mode hot):
//   default          no option: Expo Go, as before the option existed
//   expo-go          the default, spelled out
//   dev-build        a development build without expo-dev-launcher
//   dev-client       a development build with expo-dev-launcher installed
//   dev-client-perm  the same under nativeModules: 'permissive'
// The dev-client projects run from tests-native/expo-runtime/dev-client-root, where this
// file installs a stand-in expo-dev-launcher (only its package.json: the engine reads
// whether it is installed, never its code).
import fs from "node:fs";
import path from "node:path";
import { defineConfig } from "vitest/config";
import { reactNative } from "../dist/index.mjs";

const here = import.meta.dirname;
const packageRoot = path.resolve(here, "..");
const devClientRoot = path.join(here, "expo-runtime", "dev-client-root");
const launcher = path.join(devClientRoot, "node_modules", "expo-dev-launcher");
fs.mkdirSync(launcher, { recursive: true });
fs.writeFileSync(
  path.join(launcher, "package.json"),
  JSON.stringify({ name: "expo-dev-launcher", version: "0.0.0-fixture" }),
);

type Variant = {
  name: string;
  runtime?: "expo-go" | "development-build";
  devLauncher?: boolean;
  permissive?: boolean;
};
const variants: Variant[] = [
  { name: "default" },
  { name: "expo-go", runtime: "expo-go" },
  { name: "dev-build", runtime: "development-build" },
  { name: "dev-client", runtime: "development-build", devLauncher: true },
  { name: "dev-client-perm", runtime: "development-build", devLauncher: true, permissive: true },
];

export default defineConfig(({ mode }) => ({
  test: {
    // Two workers, so the hot runtime is not declined on a small machine.
    maxWorkers: 2,
    projects: variants.map((variant, index) => ({
      extends: false as const,
      root: variant.devLauncher ? devClientRoot : packageRoot,
      plugins: [
        reactNative({
          engine: "native",
          hotRuntime: mode === "hot",
          ...(variant.runtime ? { expo: { runtime: variant.runtime } } : {}),
          ...(variant.permissive ? { nativeModules: "permissive" as const } : {}),
        }),
      ],
      test: {
        name: variant.name,
        environment: "node",
        dir: path.join(here, "expo-runtime"),
        include: ["*.test.ts"],
        env: {
          VN_EXPO_RUNTIME:
            variant.runtime === "development-build" ? "development-build" : "expo-go",
          VN_DEV_LAUNCHER: variant.devLauncher ? "1" : "0",
        },
        sequence: { groupOrder: index },
      },
    })),
  },
}));

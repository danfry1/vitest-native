// The hand-written reanimated preset under the native engine, as a project with a
// reanimated before 4.7 gets it: its own mock cannot run there (it needs the Jest
// resolver reanimated ships from 4.7), so the preset's module serves, beside the real
// react-native-gesture-handler 3 running as itself.
//
// The project is tests-native/reanimated-fallback. Its reanimated is a stand-in written
// here into its (ignored) node_modules: a package without `jest/resolver.js`, whose
// helper files are the installed reanimated's, imported as an older layout imports
// them, so the preset finds reanimated's own interpolation behind that layout. Everything else resolves from this package's
// node_modules, up the tree. Run under `--mode native` or `--mode hot`.
import fs from "node:fs";
import { createRequire } from "node:module";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";
import { reactNative } from "../dist/index.mjs";

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.join(here, "reanimated-fallback");
const installed = path.dirname(
  createRequire(import.meta.url).resolve("react-native-reanimated/package.json"),
);
const standIn = path.join(root, "node_modules", "react-native-reanimated");
fs.rmSync(standIn, { recursive: true, force: true });
fs.mkdirSync(path.join(standIn, "lib", "module"), { recursive: true });
fs.writeFileSync(
  path.join(standIn, "package.json"),
  JSON.stringify({
    name: "react-native-reanimated",
    version: "4.6.0",
    main: "lib/module/interpolation.js",
  }),
);
const real = (file: string) => JSON.stringify(path.join(installed, "lib", "module", file));
const write = (file: string, code: string) => {
  fs.mkdirSync(path.dirname(path.join(standIn, "lib", "module", file)), { recursive: true });
  fs.writeFileSync(path.join(standIn, "lib", "module", file), code);
};
write("interpolation.js", `module.exports = require(${real("interpolation.js")});\n`);
// As before reanimated 4.5, interpolateColor.js imports reanimated's core and
// useSharedValue (for useInterpolateConfig), and loading those initializes reanimated,
// which fails outside the app and leaves its version global set.
write(
  "interpolateColor.js",
  `require("./core");\nrequire("./hook/useSharedValue");\n` +
    `module.exports = require(${real("interpolateColor.js")});\n`,
);
const initializes =
  `globalThis._REANIMATED_VERSION_JS = "4.6.0";\n` +
  `throw new Error("[Reanimated] Native part of Reanimated doesn't seem to be initialized.");\n`;
write("core.js", initializes);
write("hook/useSharedValue.js", initializes);

export default defineConfig(({ mode }) => {
  if (mode !== "native" && mode !== "hot") {
    throw new Error(`run with --mode native or hot (got '${mode}')`);
  }
  return {
    root,
    plugins: [reactNative({ engine: "native", hotRuntime: mode === "hot" })],
    test: { environment: "node", include: ["*.test.tsx"] },
  };
});

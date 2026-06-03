// Native-engine setup file (injected into test.setupFiles by the plugin). Installs
// globals, registers the ESM loader hook, and installs the CJS require hooks.
import { register } from "node:module";
import { installGlobals } from "./globals.mjs";
import { installRequireHooks } from "./hooks.mjs";

const projectRoot = process.env.VITEST_NATIVE_PROJECT_ROOT || process.cwd();

installGlobals();
register("./loader.mjs", import.meta.url, { data: { projectRoot } });
installRequireHooks(projectRoot);

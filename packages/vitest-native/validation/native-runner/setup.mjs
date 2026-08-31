import { register } from "node:module";

if (!globalThis.__vitest_native_native_runner_project_loader) {
  globalThis.__vitest_native_native_runner_project_loader = true;
  register("./project-loader.mjs", import.meta.url, {
    data: { projectRoot: process.cwd() },
  });
}

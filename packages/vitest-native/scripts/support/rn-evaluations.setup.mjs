// For scripts/measure-rn-evaluations.mjs: after each test file, append how many of the
// precompiled React Native registry's modules ran in it (the registry's `ran()`, reset
// per file) to the file the script names.
import fs from "node:fs";
import { createRequire } from "node:module";
import path from "node:path";
import { afterAll } from "vitest";
import { projectContext } from "../../src/context.mjs";

afterAll(() => {
  const out = process.env.VN_MEASURE_RN_EVALUATIONS;
  const file = projectContext()?.registry;
  if (!out || !file) return;
  const req = createRequire(
    path.join(projectContext()?.projectRoot ?? process.cwd(), "package.json"),
  );
  const registry = req(file).__vitestNativeRegistry;
  const worker = globalThis.__vitest_worker__;
  fs.appendFileSync(
    out,
    JSON.stringify({
      file: worker?.filepath ?? null,
      ran: registry.ran().length,
      of: registry.ids.length,
    }) + "\n",
  );
});

// Records every module Node loads in this worker, by test file, for the count gate in
// scripts/test-hot-workspace-member.mjs. A load hook runs only when Node has no module
// for the URL, through `require` and `import` alike, so each entry is one evaluation.
// Vite's own module runner never reaches it: these are Node's loads alone. Node 22.13
// has no in-thread hooks (module.registerHooks, from 22.15), so nothing is counted there.
//
// The hook is registered once per worker; this file runs again for every test file and
// marks where that file's loads begin. Loads after a file's last hook, the hot reset
// before the next file among them, are kept apart under `between`.
import fs from "node:fs";
import nodeModule from "node:module";
import { afterAll, expect } from "vitest";

const out = process.env.VN_LOAD_LOG;
type Log = { boot: string[]; between: string[]; files: { file: string; loads: string[] }[] };
const holder = process as unknown as { __vnLoadLog?: Log; __vnLoadCurrent?: string[] };

if (out && typeof nodeModule.registerHooks === "function") {
  if (!holder.__vnLoadLog) {
    holder.__vnLoadLog = { boot: [], between: [], files: [] };
    holder.__vnLoadCurrent = holder.__vnLoadLog.boot;
    nodeModule.registerHooks({
      load(url, context, nextLoad) {
        if (url.startsWith("file:")) holder.__vnLoadCurrent!.push(url);
        return nextLoad(url, context);
      },
    });
  }
  const loads: string[] = [];
  holder.__vnLoadLog.files.push({ file: expect.getState().testPath ?? "", loads });
  holder.__vnLoadCurrent = loads;
  afterAll(() => {
    holder.__vnLoadCurrent = holder.__vnLoadLog!.between;
    fs.writeFileSync(out, JSON.stringify(holder.__vnLoadLog));
  });
}

// Runs every probe under whichever engine the config selected and writes the
// results to results.<engine>.json. Run once per engine, then diff.mjs compares.
import { test } from "vitest";
import fs from "node:fs";
import path from "node:path";
import { probes } from "./probes";

const ENGINE = process.env.CROSSCHECK_ENGINE || "unknown";

test(`capture cross-check probes (${ENGINE})`, () => {
  const results: Record<string, unknown> = {};
  for (const p of probes) {
    try {
      results[p.name] = { ok: true, value: p.run() };
    } catch (e: any) {
      results[p.name] = { ok: false, error: String(e?.message ?? e) };
    }
  }
  fs.writeFileSync(
    path.join(import.meta.dirname, `results.${ENGINE}.json`),
    JSON.stringify(results, null, 2),
  );
});

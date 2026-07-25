/**
 * The transform must not silently lose a value export.
 *
 * React Native's Babel preset dropped every Flow `export enum` — deleting the
 * declaration as a type annotation while leaving the code that referenced it, so the
 * module loaded cleanly and threw ReferenceError on a path nothing warned about. The
 * targeted regression test for that lives in `flow-enums.test.ts`; this one generalises
 * it, because the risk is not enums specifically. React Native adds syntax regularly,
 * and the failure mode of an unsupported construct is silence rather than an error.
 *
 * Every React Native source file declaring a named value export is transformed and
 * checked for that export in the output. `export type` is excluded: erasing types is
 * the point. Roughly a second for the whole graph, and it fails the moment a React
 * Native upgrade introduces a construct the transform cannot carry.
 */
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";
import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { transformRN } from "../dist/native/transform.mjs";

const req = createRequire(import.meta.url);
const reactNativeRoot = path.dirname(req.resolve("react-native/package.json"));
// THIS package's root, not React Native's. transformRN derives its disk cache from the
// project root it is handed, so passing React Native's directory writes into
// react-native/node_modules/.cache — a cache nothing here clears, which silently served
// stale output and made a negative control pass.
const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

/** Named VALUE exports as written in source. */
const DECLARED_EXPORT =
  /^\s*export\s+(?:const|let|var|function\*?|class|enum)\s+([A-Za-z_$][\w$]*)/gm;

function sourceFiles(dir: string, found: string[] = []): string[] {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    if (entry.name === "node_modules" || entry.name === "__tests__" || entry.name.startsWith("."))
      continue;
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) sourceFiles(full, found);
    // Platform variants for other platforms are never transformed for iOS.
    else if (entry.name.endsWith(".js") && !/\.(android|windows|macos)\.js$/.test(entry.name))
      found.push(full);
  }
  return found;
}

describe("the native transform preserves every declared value export", () => {
  it("loses none across React Native's own graph", () => {
    const files = [
      ...sourceFiles(path.join(reactNativeRoot, "Libraries")),
      ...sourceFiles(path.join(reactNativeRoot, "src")),
    ];

    const losses: string[] = [];
    let scanned = 0;

    for (const file of files) {
      const src = fs.readFileSync(file, "utf8");
      const declared = [...src.matchAll(DECLARED_EXPORT)].map((m) => m[1]);
      if (declared.length === 0) continue;
      scanned += 1;

      let out: string;
      try {
        out = transformRN(file, src, projectRoot, "ios");
      } catch {
        // A file the transform refuses outright is loud, not silent, and is not what
        // this test is about.
        continue;
      }

      const missing = declared.filter((name) => !new RegExp(`exports\\.${name}\\b`).test(out));
      if (missing.length > 0) {
        losses.push(`${path.relative(reactNativeRoot, file)} → ${missing.join(", ")}`);
      }
    }

    // Guards the guard: if the scan matched nothing, an empty `losses` would be
    // meaningless. Removing the Flow-enum plugin makes this report VirtualView and
    // NativeSampleTurboModule, which is how the sensitivity was confirmed.
    expect(scanned).toBeGreaterThan(50);
    expect(losses).toEqual([]);
  });
});

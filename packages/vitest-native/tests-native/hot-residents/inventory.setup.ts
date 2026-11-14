// The resident-state audit's inventory (hot and fresh legs only). At the start of each
// file it records what crossed the file boundary as the same object: globals, console
// properties and CommonJS modules that the previous file ended with and this file starts
// with, excluding what the worker already had when its first file started. That is the
// state a file acquired and the worker kept. scripts/test-hot-residents.mjs compares it
// with the declared residents.
import fs from "node:fs";
import { createRequire } from "node:module";
import path from "node:path";
import { afterAll } from "vitest";

type Snapshot = Record<"global" | "console" | "module", Map<PropertyKey, unknown>>;
type Stash = { boot?: Record<keyof Snapshot, Set<PropertyKey>>; previous?: Snapshot };

const require = createRequire(import.meta.url);
const globals = globalThis as typeof globalThis & { __VN_RESIDENT_AUDIT__?: Stash };
const stash = (globals.__VN_RESIDENT_AUDIT__ ??= {});

/** Own data properties holding an object or function: those have an identity to follow. */
function objects(target: object) {
  const values = new Map<PropertyKey, unknown>();
  for (const key of Reflect.ownKeys(target)) {
    const descriptor = Object.getOwnPropertyDescriptor(target, key);
    const value = descriptor && "value" in descriptor ? descriptor.value : undefined;
    if ((typeof value === "object" && value !== null) || typeof value === "function") {
      values.set(key, value);
    }
  }
  return values;
}

function snapshot(): Snapshot {
  return {
    global: objects(globalThis),
    console: objects(console),
    module: new Map(Object.entries(require.cache)),
  };
}

const now = snapshot();
if (!stash.boot) {
  stash.boot = {
    global: new Set(now.global.keys()),
    console: new Set(now.console.keys()),
    module: new Set(now.module.keys()),
  };
} else if (stash.previous) {
  const file = path.basename(
    (globalThis as { __vitest_worker__?: { filepath?: string } }).__vitest_worker__?.filepath ??
      "unknown",
  );
  const lines: string[] = [];
  for (const kind of ["global", "console", "module"] as const) {
    for (const [key, value] of now[kind]) {
      if (stash.boot[kind].has(key) || stash.previous[kind].get(key) !== value) continue;
      lines.push(JSON.stringify({ file, kind, name: String(key) }));
    }
  }
  if (lines.length > 0) {
    fs.appendFileSync(
      path.join(process.env.VN_RESIDENT_AUDIT_DIR!, "inventory.jsonl"),
      `${lines.join("\n")}\n`,
    );
  }
}

// The inventory's self-check (--mutations): a global the config preserves but nothing
// declares. Added after the boot snapshot and during the import phase, which is when the
// hot runtime decides which preserved globals exist, so the worker keeps it.
if (process.env.VN_RESIDENT_AUDIT_PIN_UNLISTED === "1") {
  (globalThis as Record<string, unknown>).__VN_UNLISTED__ ??= {};
}

afterAll(() => {
  stash.previous = snapshot();
});

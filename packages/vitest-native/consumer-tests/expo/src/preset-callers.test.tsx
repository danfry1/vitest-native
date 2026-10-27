/**
 * A preset replaces a package, so it has to provide everything the libraries that call
 * that package use. preset-real-surface (in the package's own suite) gates the other
 * direction: a preset must not declare names the real package lacks. Names a preset
 * is missing fail only when the caller reaches them, which for expo-router 58 meant
 * every router render threw on getLinkingURL and unwrapDevLaunchURL (#296).
 *
 * This reads the callers' published builds from the installed SDK and collects every
 * member they access on a package a preset shadows, then checks the preset has it.
 * It runs here because expo-router is only installed in this fixture.
 */
import fs from "node:fs";
import path from "node:path";
import { createRequire } from "node:module";
import { describe, expect, it } from "vitest";

const require = createRequire(import.meta.url);

/** Callers whose builds reach a preset-shadowed package, and the packages they reach. */
const CALLERS: Record<string, string[]> = {
  "expo-router": ["expo-linking", "expo-constants"],
};

/**
 * How many names the scan finds in the pinned expo-router today. A scan that finds
 * fewer has stopped recognising part of the build's shape, which would otherwise pass
 * as fewer things to check. Raise these when a router upgrade uses more.
 */
const FLOOR: Record<string, number> = {
  "expo-router>expo-linking": 5,
  "expo-router>expo-constants": 1,
};

function buildFiles(pkg: string): string[] {
  const dir = path.join(path.dirname(require.resolve(`${pkg}/package.json`)), "build");
  const out: string[] = [];
  const walk = (d: string) => {
    for (const e of fs.readdirSync(d, { withFileTypes: true })) {
      const p = path.join(d, e.name);
      if (e.isDirectory()) walk(p);
      else if (e.name.endsWith(".js")) out.push(p);
    }
  };
  walk(dir);
  return out;
}

const escape = (s: string) => s.replace(/[.*+?^${}()|[\]\\/-]/g, "\\$&");

/** Named and default-member accesses a caller's build makes on `target`. */
function usedNames(caller: string, target: string) {
  const named = new Set<string>();
  const onDefault = new Set<string>();
  const q = escape(target);
  for (const file of buildFiles(caller)) {
    const src = fs.readFileSync(file, "utf8");
    if (!src.includes(target)) continue;
    // Babel's lazy CommonJS accessor: function _x() { const data = …require("pkg") … }
    for (const m of src.matchAll(
      new RegExp(`function (_\\w+)\\(\\) \\{\\s*const data = [^;]*require\\(["']${q}["']\\)`, "g"),
    )) {
      const accessor = escape(m[1]);
      for (const use of src.matchAll(new RegExp(`\\b${accessor}\\(\\)\\.default\\.(\\w+)`, "g"))) {
        onDefault.add(use[1]);
      }
      for (const use of src.matchAll(new RegExp(`\\b${accessor}\\(\\)\\.(\\w+)`, "g"))) {
        if (use[1] !== "default") named.add(use[1]);
      }
    }
    // ESM: import * as N / import N / import { a, b as c } from "pkg"
    for (const m of src.matchAll(new RegExp(`import \\* as (\\w+) from ["']${q}["']`, "g"))) {
      for (const use of src.matchAll(new RegExp(`\\b${escape(m[1])}\\.(\\w+)`, "g"))) {
        named.add(use[1]);
      }
    }
    for (const m of src.matchAll(new RegExp(`import (\\w+) from ["']${q}["']`, "g"))) {
      for (const use of src.matchAll(new RegExp(`\\b${escape(m[1])}\\.(\\w+)`, "g"))) {
        onDefault.add(use[1]);
      }
    }
    for (const m of src.matchAll(new RegExp(`import \\{([^}]*)\\} from ["']${q}["']`, "g"))) {
      for (const spec of m[1].split(",")) {
        const name = spec.trim().split(/\s+as\s+/)[0];
        if (name && !name.startsWith("type ")) named.add(name);
      }
    }
  }
  return { named: [...named].sort(), onDefault: [...onDefault].sort() };
}

describe("presets cover what their callers use", () => {
  for (const [caller, targets] of Object.entries(CALLERS)) {
    for (const target of targets) {
      it(`${caller} → ${target}`, async () => {
        const { named, onDefault } = usedNames(caller, target);
        expect(named.length + onDefault.length).toBeGreaterThanOrEqual(
          FLOOR[`${caller}>${target}`] ?? 1,
        );
        // Under the native engine this import is the preset, not the package. Its
        // module binds every DECLARED name, so presence is not enough: a declared name
        // the factory never returns is bound to undefined, and the caller still throws.
        const mod: Record<string, any> = await import(target);
        expect(named.filter((name) => mod[name] === undefined)).toEqual([]);
        expect(onDefault.filter((name) => mod.default?.[name] === undefined)).toEqual([]);
      });
    }
  }
});

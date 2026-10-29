// The project context (src/context.mjs): one validated, frozen description of a project
// that workers read instead of per-setting environment variables (ADR-0003).
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { pathToFileURL } from "node:url";
import { describe, expect, it } from "vitest";
import {
  CONTEXT_ENV,
  CONTEXT_FIELD_ENVS,
  ESCAPE_HATCHES,
  checkResolverInputs,
  localResolverView,
  contextFieldsFromSettings,
  projectContext,
  requireProjectContext,
  writeProjectContext,
} from "../src/context.mjs";
import { resolverInputsSetting } from "./project-context-helpers.js";

const SRC = path.resolve(__dirname, "../src");
const base = {
  VITEST_NATIVE_PLATFORM: "android",
  VITEST_NATIVE_DIAGNOSTICS: "false",
  VITEST_NATIVE_PROJECT_ROOT: path.resolve("/project"),
  VITEST_NATIVE_RESOLVER_INPUTS: resolverInputsSetting(path.resolve("/project"), "android"),
};
const cacheRoot = () => fs.mkdtempSync(path.join(os.tmpdir(), "vn-context-"));

describe("the project context", () => {
  it("round-trips the plugin's settings, typed and frozen", () => {
    const ref = writeProjectContext(
      contextFieldsFromSettings({
        ...base,
        VITEST_NATIVE_TRANSFORM: JSON.stringify(["a-lib"]),
        VITEST_NATIVE_DIAGNOSTICS: "true",
      }),
      cacheRoot(),
    );
    const context = projectContext(ref)!;
    expect(context.platform).toBe("android");
    expect(context.diagnostics).toBe(true);
    expect(context.transform).toEqual(["a-lib"]);
    expect(Object.isFrozen(context)).toBe(true);
    expect(Object.isFrozen(context.transform)).toBe(true);
    // One read per realm and reference.
    expect(projectContext(ref)).toBe(context);
  });

  it("is content-addressed: the same settings give the same file", () => {
    const root = cacheRoot();
    const a = writeProjectContext(contextFieldsFromSettings(base), root);
    const b = writeProjectContext(contextFieldsFromSettings(base), root);
    const c = writeProjectContext(
      contextFieldsFromSettings({ ...base, VITEST_NATIVE_PLATFORM: "ios" }),
      root,
    );
    expect(a).toBe(b);
    expect(c).not.toBe(a);
  });

  it("returns null only when no reference was given", () => {
    expect(projectContext("")).toBeNull();
    expect(() => requireProjectContext("")).toThrow(
      /CONTEXT_INVALID|context is invalid \(missing\)/,
    );
  });

  describe("fails by name instead of limping on", () => {
    const write = () => writeProjectContext(contextFieldsFromSettings(base), cacheRoot());
    const rewrite = (ref: string, edit: (doc: any) => void) => {
      const file = ref.slice(0, ref.lastIndexOf("#"));
      const doc = JSON.parse(fs.readFileSync(file, "utf8"));
      edit(doc);
      fs.writeFileSync(file, JSON.stringify(doc));
    };

    it("a missing file", () => {
      const ref = write();
      fs.rmSync(ref.slice(0, ref.lastIndexOf("#")));
      expect(() => projectContext(ref)).toThrow(/context is invalid \(missing\)/);
    });

    it("a reference without a key", () => {
      expect(() => projectContext("/nowhere.json")).toThrow(/\(missing\)/);
    });

    it("another version", () => {
      const ref = write();
      rewrite(ref, (doc) => (doc.version = 99));
      expect(() => projectContext(ref)).toThrow(/\(version\)/);
    });

    it("a file changed after it was written", () => {
      const ref = write();
      rewrite(ref, (doc) => (doc.fields.platform = "ios"));
      expect(() => projectContext(ref)).toThrow(/\(key\)/);
    });

    it("a key that is not the file's", () => {
      const ref = write();
      expect(() => projectContext(`${ref.slice(0, ref.lastIndexOf("#"))}#other`)).toThrow(
        /\(key\)/,
      );
    });

    // Every field, mutated in turn, fails naming that field.
    const mutations: Record<string, unknown> = {
      platform: "web",
      diagnostics: "yes",
      projectRoot: "relative/root",
      reactNativeVersion: 81,
      transform: "a-lib",
      sourceExts: [1],
      assetExts: {},
      hotPreserveGlobals: [null],
      hotEsmGeneration: "0",
      registry: "relative.cjs",
      ownership: [],
      projectDirs: "dir",
      requireAliases: [["only-one"]],
      requireAliasesSkipped: [1],
      presetNames: "reanimated",
      presetConfig: [],
      presetExports: "x",
      presetModules: {},
      presetDisabled: [false],
      knownNativeModules: "Foo",
      nativeModuleSpecs: [],
      nativeModules: "everything",
    };
    for (const [field, value] of Object.entries(mutations)) {
      it(`field ${field}`, () => {
        expect(() =>
          writeProjectContext(
            { ...contextFieldsFromSettings(base), [field]: value } as never,
            cacheRoot(),
          ),
        ).toThrow(new RegExp(`\\(schema: ${field}\\)`));
      });
    }

    it("an unknown field", () => {
      expect(() =>
        writeProjectContext(
          { ...contextFieldsFromSettings(base), surprise: 1 } as never,
          cacheRoot(),
        ),
      ).toThrow(/\(schema: surprise\)/);
    });

    it("a setting that does not parse, at config time", () => {
      expect(() =>
        contextFieldsFromSettings({ ...base, VITEST_NATIVE_TRANSFORM: "[not json" }),
      ).toThrow(/\(schema: transform\)/);
    });
  });
});

describe("every resolver realm resolves from the recorded inputs", () => {
  const context = () =>
    projectContext(writeProjectContext(contextFieldsFromSettings(base), cacheRoot()))!;

  it("passes when this realm sees what the record holds", () => {
    expect(() => checkResolverInputs(context(), "test realm")).not.toThrow();
  });

  it("names the field and the realm when they differ", () => {
    expect(() =>
      checkResolverInputs(context(), "ESM loader", {
        conditions: [...localResolverView().conditions, "extra"],
      }),
    ).toThrow(/the ESM loader would resolve packages with a different 'conditions'/);
    expect(() =>
      checkResolverInputs(context(), "Vite side", { projectRoot: path.resolve("/elsewhere") }),
    ).toThrow(/different 'projectRoot'/);
  });

  it("a worker started with its own --conditions fails instead of resolving apart", () => {
    // The record says what the plugin computed for the run; this process adds a
    // condition only it will use, the way a per-worker execArgv would.
    // A plain Node process's own conditions: no execArgv, no NODE_OPTIONS.
    const plain = ["require", "node", "node-addons"];
    if ((process.features as { require_module?: boolean }).require_module)
      plain.push("module-sync");
    const inputs = JSON.parse(base.VITEST_NATIVE_RESOLVER_INPUTS);
    const ref = writeProjectContext(
      contextFieldsFromSettings({
        ...base,
        VITEST_NATIVE_RESOLVER_INPUTS: JSON.stringify({ ...inputs, conditions: plain }),
      }),
      cacheRoot(),
    );
    const script = [
      `const { checkResolverInputs, requireProjectContext } = await import(${JSON.stringify(
        pathToFileURL(path.join(SRC, "context.mjs")).href,
      )});`,
      `checkResolverInputs(requireProjectContext(), "CommonJS hooks");`,
    ].join("\n");
    const run = (extra: string[]) =>
      spawnSync(process.execPath, [...extra, "--input-type=module", "-e", script], {
        encoding: "utf8",
        env: { ...process.env, [CONTEXT_ENV]: ref, NODE_OPTIONS: "" },
      });
    expect(run([]).status, run([]).stderr).toBe(0);
    const apart = run(["--conditions", "only-this-worker"]);
    expect(apart.status).not.toBe(0);
    expect(apart.stderr).toMatch(/RESOLVER_INPUT_MISMATCH|different 'conditions'/);
  });

  it("the resolver inputs are part of the content key: platform and root included", () => {
    const root = cacheRoot();
    const ios = writeProjectContext(
      contextFieldsFromSettings({
        ...base,
        VITEST_NATIVE_PLATFORM: "ios",
        VITEST_NATIVE_RESOLVER_INPUTS: resolverInputsSetting(path.resolve("/project"), "ios"),
      }),
      root,
    );
    const android = writeProjectContext(contextFieldsFromSettings(base), root);
    expect(ios).not.toBe(android);
    expect(projectContext(ios)!.resolverInputs.platform).toBe("ios");
    expect(projectContext(android)!.resolverInputs.platform).toBe("android");
  });
});

describe("workers read no other VITEST_NATIVE_ variables", () => {
  // The worker-side runtime: everything except the plugin's own main-process modules.
  const MAIN_PROCESS = new Set([
    "plugin.ts",
    "context.mjs",
    "context.d.mts",
    "native/apply.ts",
    "native/pool.ts",
    "native/memory.mjs",
    "errors.d.mts",
  ]);
  const files: string[] = [];
  const walk = (dir: string) => {
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        if (entry.name !== "cli") walk(full);
      } else if (/\.(m?js|ts|tsx)$/.test(entry.name)) {
        files.push(full);
      }
    }
  };
  walk(SRC);

  it("outside the escape hatches and the context's own variable", () => {
    const allowed = new Set([CONTEXT_ENV, ...ESCAPE_HATCHES]);
    const reads: string[] = [];
    for (const file of files) {
      const rel = path.relative(SRC, file).split(path.sep).join("/");
      if (MAIN_PROCESS.has(rel)) continue;
      const source = fs.readFileSync(file, "utf8");
      // A read is `process.env.NAME` or `process.env["NAME"]`.
      for (const match of source.matchAll(
        /process\.env(?:\.|\[\s*["'`])(VITEST_NATIVE_[A-Z0-9_]+)/g,
      )) {
        if (!allowed.has(match[1]!)) reads.push(`${rel}: ${match[1]}`);
      }
    }
    expect(reads).toEqual([]);
  });

  it("the gate can see a read (negative control)", () => {
    const sample = "const x = process.env.VITEST_NATIVE_PLATFORM;";
    expect([
      ...sample.matchAll(/process\.env(?:\.|\[\s*["'`])(VITEST_NATIVE_[A-Z0-9_]+)/g),
    ]).toHaveLength(1);
  });

  it("every field the context replaces is a context field, not an escape hatch", () => {
    for (const name of CONTEXT_FIELD_ENVS) {
      if (name === "VITEST_NATIVE_HOT_ESM_GEN") continue; // both: the plugin's opt-out and a hand-set one
      expect(ESCAPE_HATCHES).not.toContain(name);
    }
  });
});

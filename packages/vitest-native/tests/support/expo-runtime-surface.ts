/**
 * The surface of Expo's native runtime (`globalThis.expo`), read from an installed
 * expo-modules-core, and the members the native engine's stand-in lacks.
 *
 * Under the native engine, `globalThis.expo` is a JS stand-in for the runtime Expo's native
 * build installs (vitest-native's src/native/globals.mjs, installExpoGlobal), and the real
 * expo-modules-core JS runs on top of it. expo-modules-core ships its own JS version of that
 * runtime for the web and for jest-expo: `polyfill/CoreModule` (EventEmitter, NativeModule,
 * SharedObject, SharedRef) and `polyfill/dangerous-internal` (installExpoGlobalPolyfill, which
 * builds the whole `globalThis.expo` object). That polyfill is the reference read here: it is
 * executable, and it carries every runtime member of the package's type declarations
 * (ts-declarations/*.d.ts), which add only type-only fields (`_TEventsMap_DONT_USE_IT`).
 *
 * The polyfill is evaluated from its own source, not imported, so the answer does not depend
 * on how a test runner resolves or compiles the package: SDK 58 publishes it as JS
 * (build/polyfill), earlier SDKs as TypeScript only (src/polyfill), whose types Node strips.
 * Its imports other than CoreModule (the uuid helpers, type declarations) are stand-ins,
 * because only the names of what it installs are read; an import of a form this reader does
 * not know fails the evaluation loudly.
 *
 * The unit test (tests/expo-runtime-surface.test.ts) reads the workspace's SDK with it.
 * scripts/test-consumers.mjs copies it into the SDK 57 fixture's src/lib/ as it copies the
 * fixture, because that packed install is the only place SDK 57's expo-modules-core is
 * installed; the fixture's test imports the copy. Node builtins only, so the copy runs there.
 */
import fs from "node:fs";
import { stripTypeScriptTypes } from "node:module";
import path from "node:path";

/**
 * Members of the real runtime the stand-in deliberately leaves out, each with the reason.
 * A key is `Class.prototype.member` (a prototype member), `Class.member` (a static),
 * `Class#field` (an instance field the class itself declares) or `expo.key` (a top-level key).
 */
export const DELIBERATELY_OMITTED: Readonly<Record<string, string>> = {
  // The polyfill's private listener storage (`private listeners?` in its source). Nothing
  // outside the class reads it; the stand-in keeps its own `_listeners`, plus a record of each
  // listener, so the per-file reset can remove what a test file added.
  "EventEmitter#listeners": "private storage of the polyfill; the stand-in keeps its own",
  // Filled per module by the native runtime with each view's native methods. No view
  // prototypes are assigned under the stand-in; requireNativeViewManager reads them inside a
  // try/catch, which catches the miss.
  "NativeModule#ViewPrototypes":
    "no view prototypes are assigned under the stand-in; requireNativeViewManager catches the miss",
  // Set by the native runtime to each registered module's name. The stand-in sets it on each
  // module stub (makeModuleStub, globals.mjs) rather than on the base class, where the
  // polyfill leaves it undefined.
  "NativeModule#__expo_module_name__":
    "set per module, on each module stub, rather than on the base class",
};

export type RuntimeSurface = {
  /** The classes `polyfill/CoreModule` exports, by name. */
  classes: Record<string, Function>;
  /** The `globalThis.expo` object `installExpoGlobalPolyfill` builds. */
  expo: Record<string, unknown>;
};

/** The polyfill file's source as JavaScript: the built JS when published, else the TS source. */
function polyfillSource(packageDir: string, name: string): string {
  const built = path.join(packageDir, "build", "polyfill", `${name}.js`);
  if (fs.existsSync(built)) return fs.readFileSync(built, "utf8");
  const source = path.join(packageDir, "src", "polyfill", `${name}.ts`);
  if (!fs.existsSync(source)) {
    throw new Error(`expo-modules-core at ${packageDir} has no polyfill/${name} (.js or .ts)`);
  }
  // Node prints an ExperimentalWarning for stripTypeScriptTypes, once per process, and only
  // for an SDK that publishes the polyfill as TypeScript (SDK 57 here). Accepted: hiding it
  // would mean replacing process.emitWarning, which this repository does not patch.
  return stripTypeScriptTypes(fs.readFileSync(source, "utf8"));
}

// `import x from '…'` and `import { a, b as c } from '…'`, the forms the polyfill uses.
const IMPORT = /^\s*import\s+(?:(\w+)|\{([^}]*)\})\s+from\s+(['"])([^'"]+)\3;?/gm;
const RE_EXPORT = /^\s*export\s+\*\s+from\s+(['"])[^'"]+\1;?/gm;
const EXPORT_DECLARATION = /^(\s*)export\s+(class|function|const|let)\s+(\w+)/gm;

function evaluate(code: string, bindings: Record<string, unknown>, result: string[]): any {
  // A module body, evaluated with its imports passed in and its declarations returned.
  const body = `${code}\nreturn { ${result.join(", ")} };`;
  return new Function(...Object.keys(bindings), body)(...Object.values(bindings));
}

function moduleParts(source: string) {
  const imports: { local: string; imported: string; from: string }[] = [];
  let code = source.replace(IMPORT, (_all, defaultName, named, _q, from) => {
    if (defaultName) imports.push({ local: defaultName, imported: "default", from });
    for (const spec of (named ?? "")
      .split(",")
      .map((s: string) => s.trim())
      .filter(Boolean)) {
      const [imported, local = imported] = spec.split(/\s+as\s+/);
      imports.push({ local, imported, from });
    }
    return "";
  });
  code = code.replace(RE_EXPORT, "");
  const exported: string[] = [];
  code = code.replace(EXPORT_DECLARATION, (_all, indent, kind, name) => {
    exported.push(name);
    return `${indent}${kind} ${name}`;
  });
  return { code, imports, exported };
}

// Answers any property with a no-op function: the uuid helpers the polyfill installs, whose
// names are all that is read.
const anything: unknown = new Proxy({}, { get: () => () => undefined });

/** Reads the runtime surface from the expo-modules-core installed at `packageDir`. */
export function readRuntimeSurface(packageDir: string): RuntimeSurface {
  // Some SDKs import their type declarations without `import type`; only types use them.
  const core = moduleParts(polyfillSource(packageDir, "CoreModule"));
  const types = Object.fromEntries(core.imports.map(({ local }) => [local, anything]));
  const classes: Record<string, Function> = evaluate(core.code, types, core.exported);

  const internal = moduleParts(polyfillSource(packageDir, "dangerous-internal"));
  const bindings: Record<string, unknown> = {};
  for (const { local, imported, from } of internal.imports) {
    if (/(^|\/)CoreModule$/.test(from)) {
      if (!(imported in classes)) throw new Error(`CoreModule does not export ${imported}`);
      bindings[local] = classes[imported];
    } else {
      bindings[local] = anything;
    }
  }
  // Installed onto a global of its own, so the running realm's `globalThis.expo` is untouched.
  const realm: { expo?: Record<string, unknown> } = {};
  const { installExpoGlobalPolyfill } = evaluate(
    internal.code,
    { ...bindings, globalThis: realm, window: realm },
    ["installExpoGlobalPolyfill"],
  );
  installExpoGlobalPolyfill();
  if (!realm.expo) throw new Error("installExpoGlobalPolyfill installed no globalThis.expo");
  return { classes, expo: realm.expo };
}

const ownNames = (object: object, skip: string[]) =>
  Object.getOwnPropertyNames(object).filter((name) => !skip.includes(name));

/**
 * Every member of `real` that `standin` (a `globalThis.expo`) lacks, as the keys
 * DELIBERATELY_OMITTED uses, less those `omitted` lists. A member that is a function in the
 * real runtime must be one in the stand-in.
 */
export function missingMembers(
  standin: Record<string, any>,
  real: RuntimeSurface,
  omitted: Readonly<Record<string, string>> = DELIBERATELY_OMITTED,
): string[] {
  const missing: string[] = [];
  const check = (key: string, has: boolean, realValue: unknown, standinValue: unknown) => {
    if (!has) missing.push(key);
    else if (typeof realValue === "function" && typeof standinValue !== "function") {
      missing.push(`${key} (not a function)`);
    }
  };

  for (const [key, value] of Object.entries(real.expo)) {
    check(`expo.${key}`, key in standin, value, standin[key]);
  }

  for (const [name, Real] of Object.entries(real.classes)) {
    const Standin = standin[name];
    if (typeof Standin !== "function") continue; // reported as `expo.<name>` above
    for (const member of ownNames(Real.prototype, ["constructor"])) {
      check(
        `${name}.prototype.${member}`,
        member in Standin.prototype,
        Real.prototype[member],
        Standin.prototype[member],
      );
    }
    for (const member of ownNames(Real, ["length", "name", "prototype"])) {
      check(`${name}.${member}`, member in Standin, (Real as any)[member], Standin[member]);
    }
    // Fields the class itself declares: an instance's own keys, less its parent class's.
    const Parent = Object.getPrototypeOf(Real);
    const inherited = typeof Parent === "function" && Parent !== Function.prototype;
    const parentFields = inherited ? Object.keys(new (Parent as any)()) : [];
    const instance = new (Real as any)();
    const standinInstance = new Standin();
    for (const field of Object.keys(instance).filter((f) => !parentFields.includes(f))) {
      check(`${name}#${field}`, field in standinInstance, instance[field], standinInstance[field]);
    }
  }

  return missing.filter((key) => !(key in omitted));
}

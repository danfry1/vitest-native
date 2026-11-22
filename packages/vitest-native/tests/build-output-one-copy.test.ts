/**
 * Each runtime module ships once.
 *
 * The native and jest-compat runtimes, and the top-level runtime .mjs files, are copied
 * to dist verbatim: Node loads them by path, in test workers and in the plugin's own
 * process (the registry build and the Metro profile run from dist/native). A bundle that
 * also inlines one of them gives a process two instances of that module, each with its
 * own caches, and leaves tree-shaking residue that points at files relative to the wrong
 * directory: the plugin entry once carried transform.mjs's
 * `new URL("./babel-worker.mjs", import.meta.url)`, which from dist/ names a file that
 * does not exist. tsdown.config.ts marks these files external; this checks the build.
 */
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { parseAst } from "vite";
import { describe, expect, it } from "vitest";

const packageRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const dist = path.join(packageRoot, "dist");
type AstNode = {
  type: string;
  value?: unknown;
  name?: string;
  source?: AstNode;
  callee?: AstNode;
  object?: AstNode;
  property?: AstNode;
  arguments?: AstNode[];
};

const distExists = fs.existsSync(path.join(dist, "index.mjs"));

/**
 * Inlined copies the build keeps on purpose, by bundle. Each one must still be present,
 * so the list cannot outlive what it describes.
 */
// None: the CommonJS build requires the shipped errors.mjs too (tsdown.config.ts).
const KEPT_COPIES: Record<string, string[]> = {};

/** dist/*.mjs and dist/*.cjs that tsdown produced: everything but the verbatim copies. */
function bundles(): string[] {
  const verbatim = new Set(fs.readdirSync(path.join(packageRoot, "src")));
  return fs
    .readdirSync(dist)
    .filter((f) => /\.(mjs|cjs)$/.test(f) && !verbatim.has(f))
    .sort();
}

/** The source modules a bundle inlined, from the `// src/...` marker rolldown writes. */
function inlinedModules(file: string): string[] {
  const text = fs.readFileSync(path.join(dist, file), "utf8");
  return [...text.matchAll(/^\/\/ (src\/\S+)$/gm)].map((m) => m[1]);
}

/** Whether `module` (a src/ path) also ships verbatim in dist. */
function shipsVerbatim(module: string): boolean {
  return fs.existsSync(path.join(dist, module.replace(/^src\//, "")));
}

/** Every .mjs/.cjs in dist, verbatim copies included. */
function allRuntimeFiles(dir = dist, found: string[] = []): string[] {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) allRuntimeFiles(full, found);
    else if (/\.(mjs|cjs)$/.test(entry.name)) found.push(full);
  }
  return found;
}

type Reference = { kind: "import" | "url"; specifier: string };

/**
 * The relative specifiers a file loads by: static and dynamic imports, require() calls
 * and `new URL("./x", import.meta.url)`. Parsed rather than matched, so a path in a
 * comment or a generated-code string is not mistaken for one.
 */
function relativeReferences(file: string): Reference[] {
  const found: Reference[] = [];
  const relative = (node: AstNode | undefined): string | undefined =>
    node?.type === "Literal" && typeof node.value === "string" && /^\.\.?\//.test(node.value)
      ? node.value
      : undefined;
  const visit = (node: unknown): void => {
    if (Array.isArray(node)) return node.forEach(visit);
    if (!node || typeof node !== "object") return;
    const n = node as AstNode;
    let specifier: string | undefined;
    if (
      n.type === "ImportDeclaration" ||
      n.type === "ExportAllDeclaration" ||
      n.type === "ExportNamedDeclaration" ||
      n.type === "ImportExpression"
    ) {
      specifier = relative(n.source);
      if (specifier) found.push({ kind: "import", specifier });
    } else if (
      n.type === "CallExpression" &&
      n.callee?.type === "Identifier" &&
      n.callee.name === "require"
    ) {
      specifier = relative(n.arguments?.[0]);
      if (specifier) found.push({ kind: "import", specifier });
    } else if (
      n.type === "NewExpression" &&
      n.callee?.type === "Identifier" &&
      n.callee.name === "URL" &&
      n.arguments?.[1]?.type === "MemberExpression" &&
      n.arguments[1].object?.type === "MetaProperty" &&
      n.arguments[1].property?.name === "url"
    ) {
      specifier = relative(n.arguments[0]);
      if (specifier) found.push({ kind: "url", specifier });
    }
    for (const value of Object.values(n)) if (value && typeof value === "object") visit(value);
  };
  visit(parseAst(fs.readFileSync(file, "utf8")));
  return found;
}

describe("the build ships each runtime module once", () => {
  it("has a build to check against", () => {
    expect(distExists, "run `bun run build` before this suite — CI builds first").toBe(true);
  });

  it.runIf(distExists)("reads rolldown's module markers, so the check is not vacuous", () => {
    // If the markers disappear (an output option, a minifier), every check below would
    // pass on an empty list. The plugin entry always inlines plugin.ts.
    expect(inlinedModules("index.mjs")).toContain("src/plugin.ts");
  });

  it.runIf(distExists)("inlines no module that also ships verbatim", () => {
    const duplicated: string[] = [];
    for (const file of bundles()) {
      const kept = KEPT_COPIES[file] ?? [];
      for (const module of inlinedModules(file)) {
        if (shipsVerbatim(module) && !kept.includes(module)) duplicated.push(`${file}: ${module}`);
      }
    }
    expect(
      duplicated,
      `bundled copies of files dist also ships verbatim (mark them external in tsdown.config.ts):\n${duplicated.join("\n")}`,
    ).toEqual([]);
  });

  it.runIf(distExists)("still keeps each listed copy", () => {
    const stale = Object.entries(KEPT_COPIES).flatMap(([file, modules]) =>
      modules
        .filter((m) => !fs.existsSync(path.join(dist, file)) || !inlinedModules(file).includes(m))
        .map((m) => `${file}: ${m}`),
    );
    expect(stale, "KEPT_COPIES lists a copy the build no longer makes").toEqual([]);
  });

  it.runIf(distExists)("resolves every relative import and import.meta.url reference", () => {
    const missing: string[] = [];
    let urls = 0;
    for (const file of allRuntimeFiles()) {
      const rel = path.relative(dist, file);
      for (const ref of relativeReferences(file)) {
        if (ref.kind === "url") urls++;
        if (!fs.existsSync(path.resolve(path.dirname(file), ref.specifier))) {
          missing.push(
            `${rel}: ${ref.kind === "url" ? `new URL("${ref.specifier}")` : `"${ref.specifier}"`}`,
          );
        }
      }
    }
    // The native runtime starts Babel's thread and the registry compiler by URL.
    expect(urls).toBeGreaterThan(0);
    expect(missing, `references to files dist does not contain:\n${missing.join("\n")}`).toEqual(
      [],
    );
  });

  it.runIf(distExists)(
    "compiles through the shipped Babel thread in a plain Node process that loaded the plugin",
    () => {
      // The plugin's process: the root entry, then the shipped transform, as the registry
      // build does in-process. A unique source, so the disk cache cannot answer it.
      const script = `
        import fs from "node:fs";
        import os from "node:os";
        import path from "node:path";
        import { pathToFileURL } from "node:url";
        const dist = process.argv[1];
        await import(pathToFileURL(path.join(dist, "index.mjs")).href);
        const { transformRN } = await import(pathToFileURL(path.join(dist, "native/transform.mjs")).href);
        const dir = fs.mkdtempSync(path.join(os.tmpdir(), "vn-one-copy-"));
        const file = path.join(dir, "probe.tsx");
        const marker = "probe_" + process.pid + "_" + Date.now();
        fs.writeFileSync(file, "const " + marker + ": number = 1;\\nexport default " + marker + ";\\n");
        try {
          const out = transformRN(file, undefined, process.argv[2]);
          const code = typeof out === "string" ? out : out.code;
          if (!code.includes(marker) || code.includes(": number")) throw new Error("not compiled: " + code);
          console.log("compiled");
        } finally {
          fs.rmSync(dir, { recursive: true, force: true });
        }
      `;
      const result = spawnSync(
        process.execPath,
        ["--input-type=module", "-e", script, dist, packageRoot],
        { encoding: "utf8", timeout: 30_000 },
      );
      expect(result.stdout.trim(), result.stderr).toBe("compiled");
      expect(result.status, result.stderr).toBe(0);
    },
    60_000,
  );

  it.runIf(distExists)(
    "the built CLI reads the Node range from the installed manifest",
    () => {
      // A fixed path relative to the source file points outside the package once bundled,
      // and the hard-coded fallback equals the real range, so compare against a manifest
      // whose range only the manifest can supply: a copy of the package beside its own
      // node_modules, so the bundle's bare imports still resolve.
      const copy = fs.mkdtempSync(path.join(packageRoot, ".tmp-doctor-range-"));
      try {
        fs.cpSync(dist, path.join(copy, "dist"), { recursive: true });
        const manifest = JSON.parse(
          fs.readFileSync(path.join(packageRoot, "package.json"), "utf8"),
        );
        const range = `${manifest.engines.node} || >=98.7.6`;
        fs.writeFileSync(
          path.join(copy, "package.json"),
          JSON.stringify({ ...manifest, engines: { ...manifest.engines, node: range } }),
        );
        const result = spawnSync(process.execPath, [path.join(copy, "dist", "cli.mjs"), "doctor"], {
          cwd: packageRoot,
          encoding: "utf8",
          timeout: 30_000,
        });
        expect(`${result.stdout}${result.stderr}`).toContain(range);
      } finally {
        fs.rmSync(copy, { recursive: true, force: true });
      }
    },
    60_000,
  );
});

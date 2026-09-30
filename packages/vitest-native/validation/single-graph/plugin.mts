import fs from "node:fs";
import path from "node:path";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";
import type { Plugin } from "vite";
import { boundarySourceFor } from "../../src/native/boundary.mjs";
import { buildRegistry } from "../../src/native/registry.mjs";
import { resolveDeepPackageFile, resolvePlatformFile } from "../../src/native/resolve.mjs";
import { adaptOptimizedRntl } from "./optimizer.mts";

const RN_CAPSULE_ID = "\0vitest-native:single-graph-rn-capsule";
export const RN_CAPSULE_PUBLIC_ID = "virtual:vitest-native-single-graph-rn-capsule";
export const ERROR_UTILS_PUBLIC_ID = "virtual:vitest-native-single-graph-error-utils";
const RN_DEEP_FACADE_PREFIX = "\0vitest-native:single-graph-rn-deep:";

function detectBuiltEcosystemPackages(projectRoot: string): string[] {
  // The detector is internal and tsdown bundles it into a content-hashed chunk.
  // This validation bridge is intentionally ugly: a production single-graph path
  // should expose one stable ownership service rather than discover build output.
  const dist = fileURLToPath(new URL("../../dist/", import.meta.url));
  const chunk = fs.readdirSync(dist).find((name) => /^ecosystem-.*\.cjs$/.test(name));
  if (!chunk) throw new Error("single-graph experiment could not find built ecosystem detector");
  const detector = createRequire(import.meta.url)(path.join(dist, chunk)) as {
    detectEcosystemPackages(root: string): string[];
  };
  return detector.detectEcosystemPackages(projectRoot);
}

/**
 * Architecture experiment: compile React Native inside Vite's module graph.
 *
 * Deliberately independent of the production native plugin. It installs no Node
 * loader hooks and no precompiled registry, so a passing test here proves that the
 * module was evaluated by Vitest's runner rather than falling back to Node.
 */
export function singleGraphReactNative(
  options: {
    capsule?: boolean;
    namedCapsuleExports?: boolean;
    bridgeNodeRequire?: boolean;
    externalizeDeepToBridge?: boolean;
    virtualizeDeepThroughCapsule?: boolean;
    promoteRequiresFrom?: string[];
    metroResolveFrom?: string[];
    additionalRnEntrypoints?: string[];
    detectEcosystem?: boolean;
    requireNamespacePackages?: string[];
  } = {},
): Plugin {
  let babel: typeof import("@babel/core");
  let preset: string;
  let projectRoot: string;
  let reactNativeEntry: string;
  let registrySource: string | null = null;
  let reactNativeVersion = "0.0.0";
  let errorUtilsEntry: string;
  let ecosystemPackages = new Set<string>();
  const deepFacades = new Map<string, { request: string; file: string }>();
  const routeModuleFiles = new Set<string>();

  const prepareCapsule = (root: string) => {
    const req = createRequire(path.join(root, "package.json"));
    reactNativeEntry = req.resolve("react-native");
    reactNativeVersion = req("react-native/package.json").version;
    const additionalEntries = new Set(options.additionalRnEntrypoints ?? []);
    const discoveryPackages = [
      ...new Set([...(options.metroResolveFrom ?? []), ...ecosystemPackages]),
    ];
    for (const request of discoverReactNativeDeepEntrypoints(root, discoveryPackages)) {
      additionalEntries.add(request);
    }
    const registryFile = buildRegistry({
      projectRoot: root,
      platform: "ios",
      reactNativeVersion,
      assetExts: [
        "png",
        "jpg",
        "jpeg",
        "gif",
        "bmp",
        "webp",
        "svg",
        "tiff",
        "heic",
        "heif",
        "mp4",
        "mp3",
        "wav",
        "aac",
        "m4a",
        "mov",
        "webm",
        "ttf",
        "otf",
        "woff",
        "woff2",
      ],
      additionalEntries: [...additionalEntries],
    });
    if (!registryFile) throw new Error("single-graph experiment could not build RN registry");
    registrySource = registryAsEsm(
      fs.readFileSync(registryFile, "utf8"),
      root,
      options.namedCapsuleExports ? fs.readFileSync(reactNativeEntry, "utf8") : null,
      options.bridgeNodeRequire === true,
    );
  };

  const isReactNativeSource = (id: string) => {
    const file = id.split("?", 1)[0].replace(/\\/g, "/");
    return (
      file.includes("/node_modules/react-native/") || file.includes("/node_modules/@react-native/")
    );
  };

  return {
    name: "vitest-native:single-graph-experiment",
    enforce: "pre",

    configResolved(config) {
      projectRoot = config.root;
      const req = createRequire(path.join(config.root, "package.json"));
      babel = req("@babel/core");
      preset = req.resolve("@react-native/babel-preset");
      reactNativeEntry = req.resolve("react-native");
      reactNativeVersion = req("react-native/package.json").version;
      if (options.detectEcosystem) {
        ecosystemPackages = new Set(detectBuiltEcosystemPackages(projectRoot));
      }
      const rnDirectory = path.dirname(req.resolve("react-native/package.json"));
      errorUtilsEntry = createRequire(path.join(rnDirectory, "package.json")).resolve(
        "@react-native/js-polyfills/error-guard",
      );
      if (options.capsule && registrySource == null) prepareCapsule(projectRoot);
    },

    resolveId(source, importer) {
      if (options.capsule && (source === "react-native" || source === RN_CAPSULE_PUBLIC_ID)) {
        return RN_CAPSULE_ID;
      }
      if (source === ERROR_UTILS_PUBLIC_ID) return errorUtilsEntry;
      if (!importer) return undefined;
      if (source.startsWith("react-native/") && source !== "react-native/package.json") {
        const resolved = resolveDeepPackageFile(source, path.dirname(importer), "ios");
        if (resolved && options.virtualizeDeepThroughCapsule) {
          const id = `${RN_DEEP_FACADE_PREFIX}${resolved}`;
          deepFacades.set(id, { request: source, file: resolved });
          return id;
        }
        if (resolved && options.externalizeDeepToBridge) return { id: resolved, external: true };
        return resolved ?? undefined;
      }
      const normalizedImporter = importer.replace(/\\/g, "/");
      const metroOwned = [...(options.metroResolveFrom ?? []), ...ecosystemPackages].some((pkg) =>
        normalizedImporter.includes(`/node_modules/${pkg}/`),
      );
      if (
        !isReactNativeSource(importer) &&
        !metroOwned &&
        !routeModuleFiles.has(importer.split("?", 1)[0])
      ) {
        return undefined;
      }
      if (!source.startsWith(".") || path.extname(source)) return undefined;

      const resolved = resolvePlatformFile(path.resolve(path.dirname(importer), source), "ios");
      return resolved ?? undefined;
    },

    load(id) {
      if (id === RN_CAPSULE_ID) return registrySource;
      const deep = deepFacades.get(id);
      if (deep) return deepFacadeAsEsm(deep.request);
      return undefined;
    },

    transform(code, id) {
      const normalizedId = id.replace(/\\/g, "/");
      const routeRegistry = routeRegistryForTest(code, id, projectRoot, routeModuleFiles);
      if (routeRegistry) return { code: routeRegistry, map: null };
      if (
        normalizedId.includes("/deps_ssr/@testing-library_react-native.js") ||
        normalizedId.includes("/deps/@testing-library_react-native.js")
      ) {
        const next = adaptOptimizedRntl(code);
        return next === code ? undefined : { code: next, map: null };
      }
      if (id.startsWith(RN_DEEP_FACADE_PREFIX)) return undefined;
      const ecosystemBoundary = boundarySourceFor(normalizedId, "ios", reactNativeVersion);
      if (ecosystemBoundary != null && !isReactNativeSource(id)) {
        return { code: boundaryAsEsm(id.split("?", 1)[0], ecosystemBoundary), map: null };
      }
      if (!isReactNativeSource(id)) {
        if (!options.capsule) return undefined;
        const ecosystemOwned = [...ecosystemPackages].some((pkg) =>
          normalizedId.includes(`/node_modules/${pkg}/`),
        );
        const routeOwned = routeModuleFiles.has(id.split("?", 1)[0]);
        const routeContextPonyfill = normalizedId.endsWith(
          "/expo-router/build/testing-library/require-context-ponyfill.js",
        );
        const promoteRequire = options.promoteRequiresFrom?.some((pkg) => {
          const packagePath = `/node_modules/${pkg}/`;
          return normalizedId.includes(packagePath);
        });
        const rootNamedImport =
          !options.namedCapsuleExports &&
          /import\s+(?:[^;\n]*,\s*)?\{[^}]*\}\s+from\s+["']react-native["']/.test(code);
        const deepNamedImport =
          options.virtualizeDeepThroughCapsule &&
          /import\s+(?:[^;\n]*,\s*)?\{[^}]*\}\s+from\s+["']react-native\//.test(code);
        if (
          !rootNamedImport &&
          !deepNamedImport &&
          !promoteRequire &&
          !ecosystemOwned &&
          !routeOwned
        ) {
          return undefined;
        }
        const result = babel.transformSync(code, {
          filename: id.split("?", 1)[0],
          plugins: [
            ...(rootNamedImport ? [vitestReactNativeImportsToDefault] : []),
            ...(deepNamedImport ? [vitestReactNativeDeepImportsToNamespace] : []),
            ...(promoteRequire || ecosystemOwned || routeOwned
              ? [
                  [
                    viteRequireToImport,
                    { namespaceRequires: options.requireNamespacePackages ?? [] },
                  ],
                ]
              : []),
            ...(routeContextPonyfill ? [vitestDynamicRouteRequire] : []),
          ],
          presets:
            ecosystemOwned || routeOwned
              ? [
                  [
                    preset,
                    { disableStaticViewConfigsCodegen: true, disableImportExportTransform: true },
                  ],
                ]
              : [],
          parserOpts: { plugins: ["jsx", "typescript"] },
          babelrc: false,
          configFile: false,
          sourceMaps: true,
        });
        if (!result?.code) return undefined;
        return { code: result.code, map: result.map ?? null };
      }
      const file = id.split("?", 1)[0];
      if (!/\.[cm]?[jt]sx?$/.test(file)) return undefined;

      const boundary = boundarySourceFor(file.replace(/\\/g, "/"), "ios", reactNativeVersion);
      if (boundary != null) {
        return { code: boundaryAsEsm(file, boundary), map: null };
      }

      if (file === reactNativeEntry) {
        return { code: reactNativeRootAsEsm(code), map: null };
      }

      const result = babel.transformSync(code, {
        filename: file,
        plugins: [viteRequireToImport],
        presets: [
          [
            preset,
            {
              disableStaticViewConfigsCodegen: true,
              // Vitest's module runner needs ESM. The production Node path
              // deliberately asks this preset for CommonJS instead.
              disableImportExportTransform: true,
            },
          ],
        ],
        babelrc: false,
        configFile: false,
        sourceMaps: true,
        caller: {
          name: "vitest-native-single-graph-experiment",
          bundler: "vite",
          platform: "ios",
          supportsStaticESM: true,
        },
      });

      if (!result?.code) return undefined;
      return { code: result.code, map: result.map ?? null };
    },
  };
}

function routeRegistryForTest(
  code: string,
  id: string,
  projectRoot: string,
  routeModuleFiles: Set<string>,
): string | null {
  if (id.includes("/node_modules/") || !/\.[cm]?[jt]sx?$/.test(id.split("?", 1)[0])) return null;
  const roots = new Set<string>();
  for (const match of code.matchAll(/\brenderRouter\s*\(\s*["']([^"']+)["']/g)) {
    roots.add(path.resolve(projectRoot, match[1]));
  }
  if (roots.size === 0) return null;

  const files: string[] = [];
  const queue = [...roots];
  while (queue.length > 0) {
    const current = queue.pop()!;
    let entries: fs.Dirent[];
    try {
      entries = fs.readdirSync(current, { withFileTypes: true });
    } catch {
      continue;
    }
    for (const entry of entries) {
      const file = path.join(current, entry.name);
      if (entry.isDirectory()) queue.push(file);
      else if (/\.(?:js|jsx|ts|tsx)$/.test(entry.name) && !entry.name.endsWith(".d.ts"))
        files.push(file);
    }
  }
  files.sort();
  if (files.length === 0) return null;
  for (const file of files) routeModuleFiles.add(file);

  const imports = files.map(
    (file, index) => `import * as __vnRoute${index} from ${JSON.stringify(file)};`,
  );
  const entries = files.map(
    (file, index) => `${JSON.stringify(file.replace(/\\/g, "/"))}: __vnRoute${index}`,
  );
  return [
    ...imports,
    `globalThis.__vitest_native_route_modules = Object.assign(globalThis.__vitest_native_route_modules || Object.create(null), { ${entries.join(", ")} });`,
    `globalThis.__vitest_native_load_route = (request) => {`,
    `  const key = String(request).replace(/\\\\/g, "/");`,
    `  if (!(key in globalThis.__vitest_native_route_modules)) throw new Error("Vitest route registry has no module for " + key);`,
    `  return globalThis.__vitest_native_route_modules[key];`,
    `};`,
    code,
  ].join("\n");
}

function vitestDynamicRouteRequire({ types: t }: any) {
  return {
    name: "vitest-native-experiment-dynamic-route-require",
    visitor: {
      CallExpression(callPath: any) {
        const { node } = callPath;
        if (!t.isIdentifier(node.callee, { name: "require" })) return;
        if (callPath.scope.hasBinding("require")) return;
        if (node.arguments.length !== 1 || t.isStringLiteral(node.arguments[0])) return;
        callPath.replaceWith(
          t.callExpression(
            t.memberExpression(
              t.identifier("globalThis"),
              t.identifier("__vitest_native_load_route"),
            ),
            [node.arguments[0]],
          ),
        );
        callPath.skip();
      },
    },
  };
}

/**
 * Ecosystem packages sometimes import public-but-deep React Native modules that
 * are not reachable from `react-native`'s root entry. Discover literal edges at
 * config time so those lazy closures live in the same capsule instead of falling
 * through to a second Node-owned RN graph.
 */
function discoverReactNativeDeepEntrypoints(projectRoot: string, packages: string[]): string[] {
  const req = createRequire(path.join(projectRoot, "package.json"));
  const discovered = new Set<string>();
  const edge = /(?:from\s*|import\s*\(\s*|require\s*\(\s*)["'](react-native\/[^"']+)["']/g;

  for (const pkg of packages) {
    let packageRoot: string;
    try {
      packageRoot = path.dirname(req.resolve(`${pkg}/package.json`));
    } catch {
      continue;
    }
    const queue = [packageRoot];
    while (queue.length > 0) {
      const current = queue.pop()!;
      let entries: fs.Dirent[];
      try {
        entries = fs.readdirSync(current, { withFileTypes: true });
      } catch {
        continue;
      }
      for (const entry of entries) {
        if (entry.name === "node_modules" || entry.name.startsWith(".")) continue;
        const file = path.join(current, entry.name);
        if (entry.isDirectory()) {
          queue.push(file);
          continue;
        }
        if (!/\.[cm]?[jt]sx?$/.test(entry.name)) continue;
        let source: string;
        try {
          source = fs.readFileSync(file, "utf8");
        } catch {
          continue;
        }
        edge.lastIndex = 0;
        let match: RegExpExecArray | null;
        while ((match = edge.exec(source))) discovered.add(match[1]);
      }
    }
  }
  return [...discovered].sort();
}

/**
 * A deep facade has a generic default value because its CommonJS export shape is
 * not knowable from syntax alone (`export *`, computed exports and boundary source
 * are all common in RN). Rewrite named imports to prefer a Vitest mock's explicit
 * named binding and otherwise read the property from the facade's default object.
 * This keeps arbitrary deep modules generic without sacrificing partial mocks.
 */
function vitestReactNativeDeepImportsToNamespace({ types: t }: any) {
  return {
    name: "vitest-native-experiment-rn-deep-named-imports",
    visitor: {
      ImportDeclaration(importPath: any) {
        if (!importPath.node.source.value.startsWith("react-native/")) return;
        const named = importPath.node.specifiers.filter(
          (specifier: any) =>
            t.isImportSpecifier(specifier) &&
            specifier.importKind !== "type" &&
            importPath.node.importKind !== "type",
        );
        if (named.length === 0) return;

        let namespace = importPath.node.specifiers.find((specifier: any) =>
          t.isImportNamespaceSpecifier(specifier),
        );
        if (!namespace) {
          namespace = t.importNamespaceSpecifier(importPath.scope.generateUidIdentifier("rnDeep"));
          importPath.node.specifiers.push(namespace);
        }
        importPath.node.specifiers = importPath.node.specifiers.filter(
          (specifier: any) => !named.includes(specifier),
        );

        const declarations = named.map((specifier: any) => {
          const importedName = t.isIdentifier(specifier.imported)
            ? specifier.imported.name
            : specifier.imported.value;
          const namedRead = t.memberExpression(
            t.cloneNode(namespace.local),
            t.stringLiteral(importedName),
            true,
          );
          const defaultRead = t.memberExpression(
            t.memberExpression(t.cloneNode(namespace.local), t.identifier("default")),
            t.stringLiteral(importedName),
            true,
          );
          return t.variableDeclarator(
            t.cloneNode(specifier.local),
            t.conditionalExpression(
              t.binaryExpression("in", t.stringLiteral(importedName), t.cloneNode(namespace.local)),
              namedRead,
              defaultRead,
            ),
          );
        });
        importPath.insertAfter(t.variableDeclaration("const", declarations));
      },
    },
  };
}

/**
 * A default-only capsule lets RN keep its lazy public getters. Rewrite ordinary
 * named imports to destructuring so only the names a module actually imports are
 * materialised. A production version would need full type-only/import-attributes
 * coverage; this probe intentionally exercises the runtime architecture first.
 */
function vitestReactNativeImportsToDefault({ types: t }: any) {
  return {
    name: "vitest-native-experiment-rn-named-imports",
    visitor: {
      ImportDeclaration(importPath: any) {
        if (importPath.node.source.value !== "react-native") return;
        const named = importPath.node.specifiers.filter((specifier: any) =>
          t.isImportSpecifier(specifier),
        );
        if (named.length === 0) return;

        let defaultSpecifier = importPath.node.specifiers.find((specifier: any) =>
          t.isImportDefaultSpecifier(specifier),
        );
        if (!defaultSpecifier) {
          defaultSpecifier = t.importDefaultSpecifier(
            importPath.scope.generateUidIdentifier("reactNative"),
          );
          importPath.node.specifiers.unshift(defaultSpecifier);
        }
        importPath.node.specifiers = importPath.node.specifiers.filter(
          (specifier: any) => !t.isImportSpecifier(specifier),
        );

        const properties = named.map((specifier: any) =>
          t.objectProperty(
            t.cloneNode(specifier.imported),
            t.cloneNode(specifier.local),
            false,
            specifier.imported.name === specifier.local.name,
          ),
        );
        importPath.insertAfter(
          t.variableDeclaration("const", [
            t.variableDeclarator(t.objectPattern(properties), t.cloneNode(defaultSpecifier.local)),
          ]),
        );
      },
    },
  };
}

/**
 * Re-host the existing lazy CommonJS factory registry inside one Vitest-owned ESM
 * module. The RN closure keeps its real synchronous require/cache semantics, while
 * the public module id belongs to Vitest and resets with Vitest's graph.
 */
function registryAsEsm(
  registry: string,
  projectRoot: string,
  reactNativeEntrySource: string | null = null,
  bridgeNodeRequire = false,
): string {
  let code = registry
    .replace(
      '"use strict";\nconst __ext = require, __f = [], __m = [];',
      `import { createRequire as __createRequire } from "node:module";\n` +
        `const __nodeRequire = __createRequire(${JSON.stringify(path.join(projectRoot, "package.json"))});\n` +
        `function __ext(q) {\n` +
        `  try { return __nodeRequire(q); }\n` +
        `  catch (error) { console.error("[single-graph external require]", q, error); throw error; }\n` +
        `}\n` +
        `__ext.resolve = (q) => __nodeRequire.resolve(q);\n` +
        `__ext.cache = __nodeRequire.cache;\n` +
        `const __f = [], __m = [];`,
    )
    .replace(
      'const __dirs = __ids.map((f) => f.slice(0, Math.max(f.lastIndexOf("/"), f.lastIndexOf("\\\\"))));',
      `const __dirs = __ids.map((f) => f.slice(0, Math.max(f.lastIndexOf("/"), f.lastIndexOf("\\\\"))));\n` +
        `function __deep(q) {\n` +
        `  if (!(q.startsWith("react-native/") || q.startsWith("@react-native/"))) return -1;\n` +
        `  const suffixes = ["/node_modules/" + q, "/node_modules/" + q + ".js", "/node_modules/" + q + ".ios.js", "/node_modules/" + q + ".native.js"];\n` +
        `  return __ids.findIndex((id) => suffixes.some((suffix) => id.endsWith(suffix)));\n` +
        `}`,
    )
    .replace(
      "if (t === undefined || t === null) return __ext(q);",
      "if (t === undefined || t === null) { const d = __deep(q); return d < 0 ? __ext(q) : __r(d); }",
    )
    .replace(
      "if (t === undefined || t === null) return __ext.resolve(q);",
      "if (t === undefined || t === null) { const d = __deep(q); return d < 0 ? __ext.resolve(q) : __ids[d]; }",
    )
    .replace(
      /\nconst __entry = __r\(0\);[\s\S]*?\/\/# sourceMappingURL=.*$/m,
      "\nconst __entry = __r(0);",
    );

  code += "\nexport default __entry;\n";
  code +=
    `export const __vitestNativeRequire = (request) => {\n` +
    `  const direct = __ids.indexOf(request);\n` +
    `  if (direct >= 0) return __r(direct);\n` +
    `  const deep = __deep(request);\n` +
    `  if (deep >= 0) return __r(deep);\n` +
    `  return __ext(request);\n` +
    `};\n`;
  if (bridgeNodeRequire) {
    code +=
      `const __rnResolved = __nodeRequire.resolve("react-native");\n` +
      `const __rnCached = __nodeRequire.cache[__rnResolved];\n` +
      `if (__rnCached && __rnCached.exports !== __entry) {\n` +
      `  throw new Error("single-graph capsule found a pre-existing second React Native instance at " + __rnResolved);\n` +
      `}\n` +
      `if (!__rnCached) {\n` +
      `  const __Module = __nodeRequire("node:module");\n` +
      `  const __rnModule = new __Module(__rnResolved);\n` +
      `  __rnModule.id = __rnResolved;\n` +
      `  __rnModule.filename = __rnResolved;\n` +
      `  __rnModule.loaded = true;\n` +
      `  __rnModule.exports = __entry;\n` +
      `  __nodeRequire.cache[__rnResolved] = __rnModule;\n` +
      `}\n` +
      `const __rnBridgeState = globalThis.__vitest_native_single_graph_cjs_bridge;\n` +
      `if (__rnBridgeState && __rnBridgeState.entry !== __entry) {\n` +
      `  throw new Error("single-graph capsule attempted to install a second CommonJS bridge");\n` +
      `}\n` +
      `if (!__rnBridgeState) {\n` +
      `  const __Module = __nodeRequire("node:module");\n` +
      `  const __originalLoad = __Module._load;\n` +
      `  __Module._load = function(request, parent, ...rest) {\n` +
      `    if (request === "react-native") return __entry;\n` +
      `    if (typeof request === "string") {\n` +
      `      const direct = __ids.indexOf(request);\n` +
      `      if (direct >= 0) return __r(direct);\n` +
      `      const deep = __deep(request);\n` +
      `      if (deep >= 0) return __r(deep);\n` +
      `    }\n` +
      `    return __originalLoad.call(this, request, parent, ...rest);\n` +
      `  };\n` +
      `  globalThis.__vitest_native_single_graph_cjs_bridge = { entry: __entry, originalLoad: __originalLoad };\n` +
      `}\n`;
  }
  if (reactNativeEntrySource != null) {
    const names = new Set<string>();
    const publicMember = /^  (?:get\s+)?([A-Za-z_$][\w$]*)(?:<[^>]+>)?\s*\(/gm;
    let match: RegExpExecArray | null;
    while ((match = publicMember.exec(reactNativeEntrySource))) names.add(match[1]);
    // Touchable is installed with Object.defineProperty after the public object.
    names.add("Touchable");
    for (const name of names) {
      code += `export const ${name} = __entry[${JSON.stringify(name)}];\n`;
    }
  }
  if (bridgeNodeRequire) {
    // Named export materialisation above lazily evaluates the public RN closure.
    // Publish those exact CommonJS records into Node's cache. Native ESM imports
    // of a deep CJS file do not pass through Module._load, but they do consult this
    // cache; sharing the records closes that otherwise invisible twin-instance edge.
    code +=
      `for (let __i = 0; __i < __m.length; __i++) {\n` +
      `  const __record = __m[__i];\n` +
      `  if (!__record) continue;\n` +
      `  const __cached = __nodeRequire.cache[__ids[__i]];\n` +
      `  if (__cached && __cached.exports !== __record.exports) {\n` +
      `    throw new Error("single-graph capsule found a second deep React Native instance at " + __ids[__i]);\n` +
      `  }\n` +
      `  if (!__cached) __nodeRequire.cache[__ids[__i]] = __record;\n` +
      `}\n`;
  }
  return code;
}

function deepFacadeAsEsm(request: string): string {
  return [
    `import { __vitestNativeRequire as __load } from ${JSON.stringify(RN_CAPSULE_PUBLIC_ID)};`,
    `const __module = __load(${JSON.stringify(request)});`,
    `const __value = __module && __module.__esModule && "default" in __module ? __module.default : __module;`,
    `export default __value;`,
  ].join("\n");
}

/**
 * Vitest's inlined SSR runner follows ESM imports but deliberately does not own
 * synchronous CommonJS `require()` calls. React Native uses both forms in the same
 * source files, so leaving a require in otherwise-transformed ESM escapes back to
 * Node and immediately creates the second graph this experiment is trying to avoid.
 *
 * This prototype promotes literal requires to static namespace imports. It is not a
 * proposed production transform: eager evaluation and cycles are exactly what the
 * bake-off is intended to expose.
 */
function viteRequireToImport({ types: t }: any, options: { namespaceRequires?: string[] } = {}) {
  const namespaceRequires = options.namespaceRequires ?? [];
  return {
    name: "vitest-native-experiment-require-to-import",
    visitor: {
      Program: {
        enter(_path: any, state: any) {
          state.requireImports = new Map<string, any>();
        },
        exit(programPath: any, state: any) {
          const declarations = [...state.requireImports.entries()].map(([specifier, local]) =>
            t.importDeclaration([t.importNamespaceSpecifier(local)], t.stringLiteral(specifier)),
          );
          programPath.unshiftContainer("body", declarations);
        },
      },
      CallExpression(callPath: any, state: any) {
        const { node } = callPath;
        if (!t.isIdentifier(node.callee, { name: "require" })) return;
        if (callPath.scope.hasBinding("require")) return;
        if (node.arguments.length !== 1 || !t.isStringLiteral(node.arguments[0])) return;

        const specifier = node.arguments[0].value;
        let local = state.requireImports.get(specifier);
        if (!local) {
          local = callPath.scope.generateUidIdentifier("requireModule");
          state.requireImports.set(specifier, local);
        }

        // A relative RN module compiled with ESM keeps Babel's familiar
        // `{ default, named }` namespace shape. Bare CommonJS dependencies behave
        // like require(), whose value is normally the namespace's default.
        const needsNamespace = namespaceRequires.some(
          (pkg) => specifier === pkg || specifier.startsWith(`${pkg}/`),
        );
        const replacement =
          specifier.startsWith(".") || needsNamespace
            ? t.cloneNode(local)
            : t.logicalExpression(
                "??",
                t.memberExpression(t.cloneNode(local), t.identifier("default")),
                t.cloneNode(local),
              );
        callPath.replaceWith(replacement);
        callPath.skip();
      },
    },
  };
}

/**
 * RN 0.87's public entry is intentionally CommonJS with lazy getter requires.
 * Vitest's inlined SSR module runner does not convert that CJS module to ESM, so
 * this experiment emits an ESM facade whose values are still the real RN modules.
 * Static imports are acceptable for the bake-off: the production Node facade also
 * materialises every public getter to expose named ESM exports.
 */
function reactNativeRootAsEsm(source: string): string {
  const getter =
    /get\s+([A-Za-z_$][\w$]*)\s*\(\)\s*\{[\s\S]*?return\s+require\((['"])([^'"]+)\2\)(?:\s*\.\s*([A-Za-z_$][\w$]*))?\s*;?\s*\}/g;
  const imports: string[] = [];
  const exports: string[] = [];
  const names: string[] = [];
  let match: RegExpExecArray | null;
  let index = 0;
  while ((match = getter.exec(source))) {
    const [, name, , specifier, property] = match;
    if (names.includes(name)) continue;
    const local = `_rn_${index++}`;
    imports.push(`import * as ${local} from ${JSON.stringify(specifier)};`);
    const expression = property ? `${local}[${JSON.stringify(property)}]` : local;
    exports.push(`export const ${name} = ${expression};`);
    names.push(name);
  }

  // The public entry also carries one method and one compatibility getter whose
  // bodies are not shaped like the regular object getters above.
  exports.push(`export const unstable_batchedUpdates = (fn, bookkeeping) => fn(bookkeeping);`);
  names.push("unstable_batchedUpdates");
  imports.push(`import * as _rn_touchable from "./Libraries/Components/Touchable/Touchable";`);
  exports.push(`export const Touchable = _rn_touchable.default;`);
  names.push("Touchable");

  return [
    ...imports,
    ...exports,
    `const _reactNative = { ${names.join(", ")} };`,
    `export default _reactNative;`,
  ].join("\n");
}

const BOUNDARY_EXPORTS: Array<[string, string[]]> = [
  ["Libraries/TurboModule/TurboModuleRegistry.js", ["get", "getEnforcing"]],
  [
    "Libraries/NativeComponent/NativeComponentRegistry.js",
    ["get", "getWithFallback_DEPRECATED", "setRuntimeConfigProvider"],
  ],
  ["Libraries/Components/View/ViewNativeComponent.js", ["__INTERNAL_VIEW_CONFIG", "Commands"]],
  [
    "Libraries/ReactNative/RendererProxy.js",
    [
      "findNodeHandle",
      "findHostInstance_DEPRECATED",
      "dispatchCommand",
      "sendAccessibilityEvent",
      "getNodeFromInternalInstanceHandle",
      "getPublicInstanceFromInternalInstanceHandle",
      "getPublicInstanceFromRootTag",
      "isChildPublicInstance",
      "isProfilingRenderer",
      "renderElement",
      "unmountComponentAtNodeAndRemoveContainer",
      "unstable_batchedUpdates",
    ],
  ],
];

function boundaryAsEsm(file: string, source: string): string {
  const names =
    BOUNDARY_EXPORTS.find(([suffix]) => file.replace(/\\/g, "/").endsWith(suffix))?.[1] ?? [];
  return [
    `import * as _ReactNamespace from "react";`,
    `const require = (id) => { if (id === "react") return _ReactNamespace.default || _ReactNamespace; throw new Error("Unsupported boundary require: " + id); };`,
    `const module = { exports: {} };`,
    `const exports = module.exports;`,
    source,
    `const _boundary = module.exports;`,
    ...names.map((name) => `export const ${name} = _boundary[${JSON.stringify(name)}];`),
    `export default _boundary && _boundary.__esModule ? _boundary.default : _boundary;`,
  ].join("\n");
}

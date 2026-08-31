import fs from "node:fs";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { createRequire } from "node:module";

let projectRoot = process.cwd();
let babel;
let transformTypeScript;
let transformReactJsx;

export function initialize(data) {
  projectRoot = data?.projectRoot || projectRoot;
  const req = createRequire(path.join(projectRoot, "package.json"));
  babel = req("@babel/core");
  const presetReq = createRequire(req.resolve("@react-native/babel-preset/package.json"));
  transformTypeScript = presetReq.resolve("@babel/plugin-transform-typescript");
  transformReactJsx = presetReq.resolve("@babel/plugin-transform-react-jsx");
}

export async function resolve(specifier, context, nextResolve) {
  if (context.parentURL?.startsWith("file:") && specifier.startsWith(".")) {
    const parent = fileURLToPath(context.parentURL);
    const normalizedParent = parent.replace(/\\/g, "/");
    if (normalizedParent.startsWith(projectRoot.replace(/\\/g, "/") + "/")) {
      const requested = fileURLToPath(new URL(specifier, context.parentURL));
      const ext = path.extname(requested);
      const base = ext === ".js" || ext === ".jsx" ? requested.slice(0, -ext.length) : requested;
      for (const suffix of [
        ".ios.tsx",
        ".native.tsx",
        ".tsx",
        ".ios.ts",
        ".native.ts",
        ".ts",
        ".ios.jsx",
        ".native.jsx",
        ".jsx",
        ".ios.js",
        ".native.js",
        ".js",
      ]) {
        const candidate = base + suffix;
        if (fs.existsSync(candidate)) {
          return { url: pathToFileURL(candidate).href, shortCircuit: true };
        }
      }
    }
  }
  return nextResolve(specifier, context);
}

export async function load(url, context, nextLoad) {
  if (!url.startsWith("file:")) return nextLoad(url, context);
  const file = fileURLToPath(url);
  const normalized = file.replace(/\\/g, "/");
  if (
    normalized.includes("/node_modules/") ||
    !normalized.startsWith(projectRoot.replace(/\\/g, "/") + "/") ||
    !/\.tsx?$/.test(file)
  ) {
    return nextLoad(url, context);
  }

  const source = fs.readFileSync(file, "utf8");
  const result = babel.transformSync(source, {
    filename: file,
    plugins: [
      preserveLiveCommonJsImports,
      [transformTypeScript, { isTSX: file.endsWith(".tsx"), allowExtensions: true }],
      [transformReactJsx, { runtime: "automatic" }],
    ],
    babelrc: false,
    configFile: false,
    sourceMaps: "inline",
    caller: {
      name: "vitest-native-native-runner-experiment",
      bundler: "node",
      platform: "ios",
      supportsStaticESM: true,
    },
  });
  return {
    format: "module",
    source: result?.code ?? source,
    shortCircuit: true,
  };
}

/**
 * Native ESM snapshots synthetic named exports from CommonJS. RNTL deliberately
 * reassigns `exports.screen`, so keep uses as property reads from the CJS default
 * object instead of capturing the initial value during module linking.
 */
function preserveLiveCommonJsImports({ types: t }) {
  return {
    name: "vitest-native-native-runner-live-cjs-imports",
    visitor: {
      ImportDeclaration(importPath) {
        if (importPath.node.source.value !== "@testing-library/react-native") return;
        const named = importPath.node.specifiers.filter((specifier) =>
          t.isImportSpecifier(specifier),
        );
        if (named.length === 0) return;

        let defaultSpecifier = importPath.node.specifiers.find((specifier) =>
          t.isImportDefaultSpecifier(specifier),
        );
        if (!defaultSpecifier) {
          defaultSpecifier = t.importDefaultSpecifier(
            importPath.scope.generateUidIdentifier("testingLibrary"),
          );
          importPath.node.specifiers.unshift(defaultSpecifier);
        }

        for (const specifier of named) {
          const binding = importPath.scope.getBinding(specifier.local.name);
          for (const referencePath of binding?.referencePaths ?? []) {
            referencePath.replaceWith(
              t.memberExpression(
                t.cloneNode(defaultSpecifier.local),
                t.cloneNode(specifier.imported),
              ),
            );
          }
        }
        importPath.node.specifiers = importPath.node.specifiers.filter(
          (specifier) => !t.isImportSpecifier(specifier),
        );
      },
    },
  };
}

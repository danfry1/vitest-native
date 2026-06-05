// Node ESM loader hook (registered via module.register). Intercepts import() of RN —
// which Module._extensions cannot — Flow-stripping and serving boundary mock source.
import { fileURLToPath, pathToFileURL } from "node:url";
import path from "node:path";
import fs from "node:fs";
import { transformRN, isFlow } from "./transform.mjs";
import { boundarySourceFor } from "./boundary.mjs";
import { resolvePlatformFile } from "./resolve.mjs";
import { buildPkgMatcher } from "./match.mjs";

const RN_PATH = /[\\/](react-native|@react-native)[\\/]/;
const TRANSFORMABLE = /\.(jsx?|tsx?|mjs|cjs)$/;
let PROJECT_ROOT = process.cwd();
let isExtra = () => false;

export async function initialize(data) {
  if (data && data.projectRoot) PROJECT_ROOT = data.projectRoot;
  if (data && data.transformPkgs) isExtra = buildPkgMatcher(data.transformPkgs);
}

export async function resolve(specifier, context, nextResolve) {
  const parent =
    context.parentURL && context.parentURL.startsWith("file:")
      ? fileURLToPath(context.parentURL)
      : null;
  if (parent && RN_PATH.test(parent) && specifier.startsWith(".") && !path.extname(specifier)) {
    const hit = resolvePlatformFile(path.resolve(path.dirname(parent), specifier));
    if (hit) return { url: pathToFileURL(hit).href, shortCircuit: true };
  }
  return nextResolve(specifier, context);
}

export async function load(url, context, nextLoad) {
  if (!url.startsWith("file:")) return nextLoad(url, context);
  const file = fileURLToPath(url);
  const norm = file.replace(/\\/g, "/");
  const isRN = RN_PATH.test(norm);
  if (!isRN && !isExtra(norm)) return nextLoad(url, context);

  if (isRN) {
    const boundary = boundarySourceFor(norm);
    if (boundary != null) return { format: "commonjs", source: boundary, shortCircuit: true };
    if (norm.endsWith(".js")) {
      const src = fs.readFileSync(file, "utf8");
      if (isFlow(src))
        return {
          format: "commonjs",
          source: transformRN(file, src, PROJECT_ROOT),
          shortCircuit: true,
        };
    }
    return nextLoad(url, context);
  }

  // Configured third-party package: transform any JS/TS/JSX source to CJS.
  if (TRANSFORMABLE.test(norm)) {
    const src = fs.readFileSync(file, "utf8");
    return { format: "commonjs", source: transformRN(file, src, PROJECT_ROOT), shortCircuit: true };
  }
  return nextLoad(url, context);
}

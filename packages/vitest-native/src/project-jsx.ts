/**
 * JSX in a project's own `.js` files.
 *
 * Metro and babel-jest parse every `.js` file with JSX enabled, so React Native projects
 * keep JSX in `.js` sources, tests and setup files (a `jest.setup.js` that renders a
 * provider, say). Vite's Oxc transform chooses the language by extension and skips `.js`
 * entirely, so the same file reaches Vite's parser with its JSX intact and fails to
 * compile. This compiles a project `.js` file as JSX, with the same Oxc options Vite
 * applies to `.jsx` and `.tsx` (the automatic runtime this plugin configures, plus any
 * the user set), and returns its sourcemap so Vite chains it.
 *
 * It runs when the file is loaded, before every transform: under the native engine the
 * plugin's own transform hook runs after Vite's (see plugin.ts), too late for a file
 * Vite's import analysis cannot parse.
 *
 * Only files outside `node_modules`: packages are compiled by their own path (the native
 * engine's Babel transform, or the mock engine's Flow strip and Vite's pipeline).
 */
import fs from "node:fs";
import path from "node:path";
import { transformWithOxc } from "vite";
import type { ResolvedConfig } from "vite";

type OxcOptions = NonNullable<Parameters<typeof transformWithOxc>[2]>;

/** The Oxc options for a project `.js` file, or undefined when Oxc is turned off. */
export function projectJsxOptions(oxc: ResolvedConfig["oxc"]): OxcOptions | undefined {
  if (oxc === false || oxc === undefined) return undefined;
  // The filter and injection settings belong to Vite's plugin, not to the transform.
  const {
    include: _include,
    exclude: _exclude,
    jsxInject: _jsxInject,
    jsxRefreshInclude: _jsxRefreshInclude,
    jsxRefreshExclude: _jsxRefreshExclude,
    ...transform
  } = oxc;
  return { ...transform, lang: "jsx" };
}

const NODE_MODULES = /[\\/]node_modules[\\/]/;
// A JSX element or fragment opens with `<` and a name or `>`. Comparisons match too,
// which only costs a transform that changes nothing.
const MAY_HAVE_JSX = /<[A-Za-z_$>]/;

/** Whether `id` is a project `.js` file this transform compiles. */
export function isProjectJsFile(id: string): boolean {
  const file = id.split("?", 1)[0];
  return file.endsWith(".js") && path.isAbsolute(file) && !NODE_MODULES.test(file);
}

/**
 * A project `.js` file compiled as JSX, or undefined to leave it to Vite: not a project
 * `.js` file, no possible JSX, or Oxc turned off.
 */
export async function loadProjectJsx(
  id: string,
  options: OxcOptions | undefined,
  config: ResolvedConfig | undefined,
): Promise<{ code: string; map: Awaited<ReturnType<typeof transformWithOxc>>["map"] } | undefined> {
  if (!options || !isProjectJsFile(id)) return undefined;
  const file = id.split("?", 1)[0];
  const code = await fs.promises.readFile(file, "utf8");
  if (!MAY_HAVE_JSX.test(code)) return undefined;
  const result = await transformWithOxc(code, file, options, undefined, config);
  return { code: result.code, map: result.map };
}

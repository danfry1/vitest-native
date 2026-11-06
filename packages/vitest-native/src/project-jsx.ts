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
import { AsyncLocalStorage } from "node:async_hooks";
import fs from "node:fs";
import path from "node:path";
import { transformWithOxc } from "vite";
import type { ResolvedConfig, Rollup } from "vite";

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
  // No React Refresh: test files are never hot-replaced, and Vite turns it off for
  // server consumers in its own Oxc plugin too.
  const jsx =
    typeof transform.jsx === "object" ? { ...transform.jsx, refresh: false } : transform.jsx;
  return { ...transform, jsx, lang: "jsx" };
}

const NODE_MODULES = /[\\/]node_modules[\\/]/;
// A JSX element or fragment opens with `<` and a name or `>`. Comparisons match too,
// which only costs a transform that changes nothing.
const MAY_HAVE_JSX = /<[A-Za-z_$>]/;

/**
 * Whether `id` is a project `.js` file this compiles: the plain file, outside
 * `node_modules`. An id with a query is a different module made from the file (`?raw` is
 * its text, `?url` its URL), so it is left to the plugin that serves that query.
 */
export function isProjectJsFile(id: string): boolean {
  return id.endsWith(".js") && !id.includes("?") && path.isAbsolute(id) && !NODE_MODULES.test(id);
}

/** A dev environment's plugin container (Vite's DevEnvironment), as much as this needs. */
export type LoadChain = { load(id: string): Promise<Rollup.LoadResult> } | undefined;

// The id this module's own load is asking the rest of the chain about, in that call's
// async context only: a concurrent load of the same file (another environment, another
// project's plugin) runs in its own context and is not mistaken for the re-entry.
const asking = new AsyncLocalStorage<string>();

/**
 * A project `.js` file compiled as JSX, or undefined to leave it to Vite: not a project
 * `.js` file, no possible JSX, Oxc turned off, or a file Oxc cannot parse as JSX (Flow,
 * say, which a project's own transform plugin may strip later).
 *
 * Another plugin that loads the file keeps it: the chain is asked first (this hook
 * answers nothing to its own question), and what a plugin returns is served as it
 * returned it. The plugin's load hook runs early because the plugin is `enforce: "pre"`
 * (it also serves assets and virtual modules ahead of Vite's own plugins); asking first
 * keeps that from taking a file away from a project's own plugin.
 */
export async function loadProjectJsx(
  id: string,
  options: OxcOptions | undefined,
  config: ResolvedConfig | undefined,
  chain: LoadChain,
  log?: (message: string) => void,
): Promise<Rollup.LoadResult> {
  if (!options || !isProjectJsFile(id) || asking.getStore() === id) return undefined;
  const code = await fs.promises.readFile(id, "utf8");
  if (!MAY_HAVE_JSX.test(code)) return undefined;
  if (chain) {
    const other = await asking.run(id, () => chain.load(id));
    if (other != null) return other;
  }
  let result: Awaited<ReturnType<typeof transformWithOxc>>;
  try {
    result = await transformWithOxc(code, id, options, undefined, config);
  } catch (error) {
    log?.(
      `[vitest-native] ${id} is not JSX Oxc can parse (${(error as Error).message.split("\n")[0]}); serving it unchanged.`,
    );
    return undefined;
  }
  return { code: result.code, map: result.map };
}

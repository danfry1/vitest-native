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
 * engine's Babel transform, or the mock engine's Flow strip and Vite's pipeline). The one
 * exception is loadPackageJsx below: a package's `.js` file that Vite serves uncompiled and
 * cannot parse.
 */
import { AsyncLocalStorage } from "node:async_hooks";
import path from "node:path";
import { parseAst, transformWithOxc } from "vite";
import type { ResolvedConfig, Rollup } from "vite";
import { readProjectSource } from "./project-source-file.js";

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
  // No file: a virtual module a later plugin serves (src/project-source-file.ts).
  const code = await readProjectSource(id);
  if (code === null || !MAY_HAVE_JSX.test(code)) return undefined;
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

/**
 * A `.js` file inside `node_modules`: the plain file, no query. The native engine compiles
 * the packages it detects in Node, so such a file reaching Vite's load belongs to a package
 * nothing compiles.
 */
export function isPackageJsFile(id: string): boolean {
  return id.endsWith(".js") && !id.includes("?") && path.isAbsolute(id) && NODE_MODULES.test(id);
}

/** The package a `node_modules` path belongs to, `@scope/name` or `name`, or null. */
export function packageOfFile(id: string): string | null {
  const parts = id.split(/[\\/]/);
  const at = parts.lastIndexOf("node_modules");
  if (at < 0 || at + 1 >= parts.length) return null;
  const first = parts[at + 1];
  return first.startsWith("@") && at + 2 < parts.length ? `${first}/${parts[at + 2]}` : first;
}

/** Whether Vite's parser accepts the code: Vite's import analysis fails on what it rejects. */
function parses(code: string): boolean {
  try {
    parseAst(code);
    return true;
  } catch {
    return false;
  }
}

// Packages already warned about in this process: the warning names the package once.
const warnedPackages = new Set<string>();

/**
 * A package's `.js` file with JSX that nothing compiles, compiled as JSX, or undefined to
 * leave the file as it is (#763).
 *
 * Under the native engine a package the engine does not detect (one that declares no
 * `react-native` dependency or peer, such as react-native-calendars, whose `main` is
 * `src/index.ts`) can be served by Vite. Oxc compiles its `.ts` files and skips its `.js`
 * ones, so JSX in a `.js` file failed Vite's import analysis. The file is compiled here
 * exactly as a project `.js` file is, and stays in Vite: no package changes owner.
 *
 * Only a file Vite's parser rejects is touched, so every file that loads today loads the
 * same. Another plugin's load still wins, as for project files, and later transforms still
 * run on the result. When Oxc cannot compile it either (Flow, say), the file is served as
 * it is, Vite reports its own parse error, and one warning names the package and the fix.
 */
export async function loadPackageJsx(
  id: string,
  options: OxcOptions | undefined,
  config: ResolvedConfig | undefined,
  chain: LoadChain,
  log?: (message: string) => void,
  warn: (message: string) => void = console.warn,
): Promise<Rollup.LoadResult> {
  if (!options || !isPackageJsFile(id) || asking.getStore() === id) return undefined;
  const code = await readProjectSource(id);
  if (code === null || !MAY_HAVE_JSX.test(code) || parses(code)) return undefined;
  if (chain) {
    const other = await asking.run(id, () => chain.load(id));
    if (other != null) return other;
  }
  const pkg = packageOfFile(id) ?? id;
  let result: Awaited<ReturnType<typeof transformWithOxc>>;
  try {
    result = await transformWithOxc(code, id, options, undefined, config);
  } catch {
    if (!warnedPackages.has(pkg)) {
      warnedPackages.add(pkg);
      warn(
        `[vitest-native] ${pkg} ships source Vite cannot parse (${id}), and nothing compiles ` +
          `the package. Add it to reactNative({ transform: ['${pkg}'] }). ` +
          `See https://github.com/danfry1/vitest-native/issues/763.`,
      );
    }
    return undefined;
  }
  log?.(`[vitest-native] compiled JSX in ${id}: ${pkg} is served by Vite uncompiled (#763).`);
  return { code: result.code, map: result.map };
}

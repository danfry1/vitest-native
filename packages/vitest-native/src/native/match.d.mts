/** Any file under a node_modules directory. */
export declare const NODE_MODULES_PATH: RegExp;

/** React Native's own source, including the `@react-native/*` packages. */
export declare const REACT_NATIVE_PATH: RegExp;

/** Does `dir` contain `target` (or equal it)? Case-insensitive on Windows. */
export declare function containsPath(dir: string, target: string): boolean;

/** The on-disk directory a package resolves to from `projectRoot`, or null. */
export declare function packageDirOf(name: string, projectRoot: string): string | null;

/**
 * The patterns identifying one package's files: under `node_modules/<name>/`, and
 * inside the directory it resolves to. The second is omitted when that directory
 * contains `projectRoot` — the project is not one of its own dependencies.
 */
export declare function packagePatterns(name: string, projectRoot?: string): RegExp[];

/** A predicate over `packagePatterns` for every named package. */
export declare function buildPkgMatcher(
  pkgs: string[] | undefined,
  projectRoot?: string,
): (file: string) => boolean;

/** The bare package name of an import specifier. */
export declare function packageNameOf(specifier: string): string;

/** The leaf module name a subpath import points at, or null. */
export declare function subpathLeafOf(specifier: string): string | null;

/** Deep entries of preset packages that must not be shadowed by the preset mock. */
export declare function isUtilitySubpath(specifier: string): boolean;

export declare function serializableAliases(
  alias: unknown,
  root: string,
): { entries: [string, string][]; skipped: string[] };
export declare function expandAlias(specifier: string, entries: [string, string][]): string;
export declare const JEST_COMPAT_SHIM_FILES: Readonly<Record<string, string>>;

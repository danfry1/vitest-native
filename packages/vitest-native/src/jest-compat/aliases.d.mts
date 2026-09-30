export declare function serializableAliases(
  alias: unknown,
  root: string,
): { entries: [string, string][]; skipped: string[] };
export declare function expandAlias(specifier: string, entries: [string, string][]): string;

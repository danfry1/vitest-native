import { VitestNativeError } from "./errors.mjs";

/**
 * The Node versions this package runs on: `engines.node`, which a test holds this
 * constant to. Each line starts where Node's in-thread module hooks
 * (`module.registerHooks`) carry the engine. Before 22.22.3 and 24.12 they fail it
 * (expo-router's elements do not load, and the hot runtime's CommonJS reset stops
 * mattering), and Node 25 was never measured.
 */
export const SUPPORTED_NODE = ">=22.22.3 <23 || >=24.12.0 <25 || >=26.0.0";

const versionParts = (version: string): [number, number, number] => {
  const [major = 0, minor = 0, patch = 0] = version
    .replace(/^v/, "")
    .split(/[.-]/)
    .map((part) => Number.parseInt(part, 10) || 0);
  return [major, minor, patch];
};

const compareVersions = (a: string, b: string): number => {
  const [x, y] = [versionParts(a), versionParts(b)];
  return x[0] - y[0] || x[1] - y[1] || x[2] - y[2];
};

/**
 * Whether `version` is in `range`: `||`-separated sets of space-separated comparators
 * (`>=`, `>`, `<=`, `<`, `=`), the forms `engines.node` uses. A version missing parts
 * reads them as 0 (`<23` is `<23.0.0`).
 */
export function satisfiesNodeRange(version: string, range: string): boolean {
  return range.split("||").some((set) =>
    set
      .trim()
      .split(/\s+/)
      .filter(Boolean)
      .every((comparator) => {
        const match = /^(>=|<=|>|<|=)?\s*v?(\d[\w.-]*)$/.exec(comparator);
        if (!match) return false;
        const order = compareVersions(version, match[2]);
        switch (match[1] ?? "=") {
          case ">=":
            return order >= 0;
          case ">":
            return order > 0;
          case "<=":
            return order <= 0;
          case "<":
            return order < 0;
          default:
            return order === 0;
        }
      }),
  );
}

/** Fail at startup, by name, on a Node this package does not run on. */
export function assertSupportedNode(version: string = process.versions.node): void {
  if (satisfiesNodeRange(version, SUPPORTED_NODE)) return;
  throw new VitestNativeError(
    "UNSUPPORTED_NODE",
    `Node ${version} is not supported. vitest-native runs on Node 22.22.3 or later on Node 22, ` +
      `24.12.0 or later on Node 24, and Node 26 or later (engines.node: ${SUPPORTED_NODE}). ` +
      `An update within your Node major is enough, for example with \`nvm install 22\` or ` +
      `\`fnm install 24\`.`,
  );
}

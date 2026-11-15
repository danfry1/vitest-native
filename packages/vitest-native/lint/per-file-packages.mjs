// The packages a preset module may not take once per worker, for the lint rule
// preset-react-per-file and tests/presets-hold-no-react.test.ts, from one list: the ones
// freshRuntime evaluates again for each file (RUNTIME_RESIDENT_PACKAGES, resident only
// without it), plus React Native, whose modules the registry evaluates again for each
// file, so a copy taken once is the first file's components, built with its React.
import { RUNTIME_RESIDENT_PACKAGES } from "../src/native/ownership.mjs";

export const PER_FILE_PACKAGES = Object.freeze([
  ...RUNTIME_RESIDENT_PACKAGES,
  "react-native",
  "@react-native/*",
]);

const PATTERN = new RegExp(
  `^(?:${PER_FILE_PACKAGES.map((name) =>
    name.replace(/[.+?^${}()|[\]\\]/g, "\\$&").replace("/*", "/[^/]+"),
  ).join("|")})(?:/|$)`,
);

/** Whether a module specifier names one of PER_FILE_PACKAGES, or a file inside one. */
export const isPerFilePackage = (specifier) => PATTERN.test(specifier);

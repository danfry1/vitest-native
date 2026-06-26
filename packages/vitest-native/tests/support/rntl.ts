// Shared test helper: the installed @testing-library/react-native major version.
// vitest-native supports a range of RNTL versions (peer `>=12 <15`), and a few
// behaviors changed across majors — RNTL 14 made fireEvent.press disabled-aware and
// exposes nested-<Text> fragments individually, where 12/13 did not. Tests that pin
// such version-specific RNTL behavior gate on this so the suite is green across the
// supported range (the engine itself is version-agnostic).
import { createRequire } from "node:module";

const req = createRequire(import.meta.url);

export const rntlMajor: number = (() => {
  try {
    const { version } = req("@testing-library/react-native/package.json") as { version: string };
    return Number(version.split(".")[0]) || 0;
  } catch {
    return 0;
  }
})();

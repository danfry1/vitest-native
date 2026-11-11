// The run (a fresh install, so a cold transform cache) prints no sourcemap warning for the
// module jest-compat generates.
import fs from "node:fs";
const output = fs.readFileSync(0, "utf8");
const line = output.split("\n").find((l) => /Sourcemap for .* points to missing source files/.test(l));
if (line) {
  console.log(line.trim().replace(/"[^"]*\/(vitest-native\.root-mocks\.mjs)"/, '"<root>/$1"'));
  process.exit(1);
}

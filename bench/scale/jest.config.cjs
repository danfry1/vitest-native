// jest with the React Native preset — the incumbent the whole project is
// measured against. Worker count is passed on the CLI (--maxWorkers=N) by the
// harness, not here, so this config stays count-agnostic.
//
// rootDir is the bench root (NOT this scale/ dir) so jest picks up bench's
// babel.config.cjs — without it, react-native/jest/setup.js fails to parse
// (its Flow types never get stripped).
const path = require("node:path");
module.exports = {
  preset: "react-native",
  rootDir: path.join(__dirname, ".."),
  testMatch: ["<rootDir>/scale/__suite__/*.test.tsx"],
  transformIgnorePatterns: ["node_modules/.bun/(?!(.*react-native))"],
};

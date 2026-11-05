// The shape of a real library's TypeScript Jest config (react-native-elements' packages/base):
// a type-only import, annotations, and `module.exports`. Jest loads it through ts-node;
// migrate loads it through Node's type stripping.
import type { Config } from "jest";

const config: Config = {
  preset: "react-native",
  displayName: "@fixture/base",
  testPathIgnorePatterns: [
    "./src/SearchBar/__tests__/common.tsx",
    "<rootDir>/node_modules",
    "<rootDir>/dist",
  ],
  setupFilesAfterEnv: ["<rootDir>/.ci/setupTests.ts"],
  testRegex: "/__tests__/.*\\.(ts|tsx|js)$",
  testTimeout: 7000 as number,
};

module.exports = config;

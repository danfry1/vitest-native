/**
 * Scratch projects for the migrate tests (migrate-discovery.test.ts and its end-to-end
 * half, migrate-discovery.e2e.test.ts): a temporary directory per fixture, removed after
 * the file, and the jest-expo app shape the discovery gaps were measured on.
 */
import fs from "node:fs";
import { createRequire } from "node:module";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { afterAll } from "vitest";

export const packageRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");

const roots: string[] = [];
afterAll(() => {
  for (const r of roots) fs.rmSync(r, { recursive: true, force: true });
});

export function fixture(files: Record<string, string | object>): string {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "vn-migrate-"));
  roots.push(root);
  for (const [rel, content] of Object.entries(files)) {
    const p = path.join(root, rel);
    fs.mkdirSync(path.dirname(p), { recursive: true });
    fs.writeFileSync(p, typeof content === "string" ? content : JSON.stringify(content, null, 2));
  }
  return root;
}

// jest-expo 57.0.5's getPlatformPreset for ['ios', 'native'] (config/getPlatformPreset.js
// and config/extensions.js), the discovery keys only.
export const JEST_EXPO_IOS = {
  testMatch: ["", "ios", "native"].flatMap((platform) => {
    const p = platform ? `.${platform}` : "";
    return [
      `**/__tests__/**/*spec${p}.[jt]s?(x)`,
      `**/__tests__/**/*test${p}.[jt]s?(x)`,
      `**/?(*.)+(spec|test)${p}.[jt]s?(x)`,
    ];
  }),
  testPathIgnorePatterns: ["/node_modules/", "/__rsc_tests__/"],
  moduleFileExtensions: [
    ...["ios", "native", ""].flatMap((platform) =>
      ["ts", "tsx", "js", "jsx"].map((ext) => (platform ? `${platform}.${ext}` : ext)),
    ),
    "json",
  ],
};

/** A project shaped like the jest-expo app the gaps were measured on. */
export function blueskyLike(extra: Record<string, string | object> = {}): string {
  const root = fixture({
    "package.json": {
      name: "social-app",
      scripts: { test: "NODE_ENV=test jest --forceExit --testTimeout=20000 --bail" },
      dependencies: {
        expo: "57.0.0",
        "react-native": "0.86.0",
        "expo-image": "1.0.0",
        multiformats: "13.0.0",
        "await-lock": "2.2.2",
        "legacy-cjs": "1.0.0",
        "jsx-lib": "1.0.0",
        lodash: "4.0.0",
      },
      jest: {
        preset: "jest-expo/ios",
        transformIgnorePatterns: [
          "node_modules/(?!((jest-)?react-native|@react-native(-community)?)|expo(nent)?|@expo(nent)?/.*|await-lock|legacy-cjs|jsx-lib|multiformats)",
        ],
        modulePathIgnorePatterns: ["bskylink/.*", "__e2e__/.*", "__tests__/.*/__mocks__"],
        moduleNameMapper: {
          "^multiformats/cid$": "<rootDir>/node_modules/multiformats/dist/src/cid.js",
          // A redirect to ANOTHER package, though lodash itself serves "lodash".
          "^lodash$": "<rootDir>/node_modules/lodash-es/lodash.js",
          "^config$": "<rootDir>/src/config.ts",
          "\\.(png|jpg|db)$": "<rootDir>/__mocks__/file.js",
        },
      },
    },
    "babel.config.js": `module.exports = function (api) {
  api.cache(true)
  return {
    presets: ['babel-preset-expo'],
    plugins: [
      '@lingui/babel-plugin-lingui-macro',
      ['babel-plugin-react-compiler', { target: '19' }],
      ['module-resolver', { alias: { '#': './src' } }],
      'react-native-worklets/plugin',
      'some-inline-env-plugin',
    ],
  }
}
`,
    "node_modules/jest-expo/ios/jest-preset.js": `module.exports = ${JSON.stringify(JEST_EXPO_IOS)};`,
    "node_modules/jest-expo/package.json": { name: "jest-expo", version: "57.0.5" },
    "node_modules/expo-image/package.json": {
      name: "expo-image",
      version: "1.0.0",
      peerDependencies: { "react-native": "*" },
    },
    "node_modules/multiformats/package.json": {
      name: "multiformats",
      version: "13.0.0",
      type: "module",
      exports: { ".": { import: "./dist/index.js" }, "./cid": { import: "./dist/src/cid.js" } },
    },
    "node_modules/await-lock/package.json": {
      name: "await-lock",
      version: "2.2.2",
      type: "module",
      exports: "./index.js",
    },
    "node_modules/legacy-cjs/package.json": {
      name: "legacy-cjs",
      version: "1.0.0",
      main: "index.js",
    },
    "node_modules/legacy-cjs/index.js": "module.exports = { ok: true };",
    // Untranspiled JSX in a published .js, one directory below its entry.
    "node_modules/jsx-lib/package.json": {
      name: "jsx-lib",
      version: "1.0.0",
      main: "lib/index.js",
    },
    "node_modules/jsx-lib/lib/index.js": "module.exports = require('./view/Box');",
    "node_modules/jsx-lib/lib/view/Box.js": "module.exports = () => <Box />;",
    "node_modules/lodash/package.json": { name: "lodash", version: "4.0.0", main: "lodash.js" },
    ...extra,
  });
  withBabelParser(root);
  return root;
}

/** Link the real @babel/parser in, as an installed RN project has it. */
function withBabelParser(root: string): void {
  const fromCore = createRequire(createRequire(import.meta.url).resolve("@babel/core"));
  const parserDir = path.dirname(fromCore.resolve("@babel/parser/package.json"));
  fs.mkdirSync(path.join(root, "node_modules", "@babel"), { recursive: true });
  fs.symlinkSync(parserDir, path.join(root, "node_modules", "@babel", "parser"));
}

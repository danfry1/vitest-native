import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterAll, describe, expect, it } from "vitest";
import { writeProjectContext } from "../src/context.mjs";
import { initialize, loadSync, resolveSync } from "../src/native/loader.mjs";

// Under the hot runtime the synthetic preset module an ES import links carries the hot
// generation, as a stamped file does: Node keeps an ES module by URL for the worker's
// life, and the module reads the preset mocks of the file that evaluates it
// (tests-native/hot-preset-esm-generation.test.ts runs it end to end).
const root = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), "vn-preset-generation-")));
afterAll(() => fs.rmSync(root, { recursive: true, force: true }));
fs.writeFileSync(path.join(root, "package.json"), JSON.stringify({ name: "app" }));

const generation = new Int32Array(new SharedArrayBuffer(4));
initialize({
  projectRoot: root,
  platform: "ios",
  hotGenerationBuffer: generation.buffer,
  presetExports: { "react-native-safe-area-context": ["useSafeAreaInsets"] },
  context: writeProjectContext(
    { platform: "ios", diagnostics: false, projectRoot: root },
    path.join(root, ".cache"),
  ),
});

const resolvePreset = () =>
  resolveSync(
    "react-native-safe-area-context",
    { parentURL: undefined, conditions: ["import"] },
    () => {
      throw new Error("a preset package resolves without Node");
    },
  ).url;

describe("hot generation of the synthetic preset module", () => {
  it("is unstamped before the first hot generation", () => {
    generation[0] = 0;
    expect(resolvePreset()).toBe("vitest-native-preset:react-native-safe-area-context");
  });

  it("carries the generation, a new URL for each test file", () => {
    generation[0] = 2;
    expect(resolvePreset()).toBe("vitest-native-preset:react-native-safe-area-context?vnhot=2");
    generation[0] = 3;
    expect(resolvePreset()).toBe("vitest-native-preset:react-native-safe-area-context?vnhot=3");
  });

  it("serves the package's mock whatever the stamp", () => {
    const { source } = loadSync(
      "vitest-native-preset:react-native-safe-area-context?vnhot=3",
      {},
      () => {
        throw new Error("the preset module is served by the loader");
      },
    ) as { source: string };
    expect(source).toContain('["react-native-safe-area-context"]');
    expect(source).toContain("export const useSafeAreaInsets");
    expect(source).not.toContain("vnhot");
  });
});

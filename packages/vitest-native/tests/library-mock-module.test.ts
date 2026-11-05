// A preset whose module is the library's own mock (presets/library-mock.ts): under the
// native engine its export names are the mock's, the further files it spreads included
// (reanimated's mock.js spreads mock-svg.js).
import fs from "node:fs";
import { createRequire } from "node:module";
import os from "node:os";
import path from "node:path";
import { afterAll, expect, it } from "vitest";
import { mockModuleExportNames } from "../src/presets/esm-export-names.js";
import { reanimated } from "../src/presets/index.js";

const require = createRequire(import.meta.url);
const dir = path.dirname(require.resolve("react-native-reanimated/package.json"));

it("names what reanimated's mock spreads from mock-svg.js", () => {
  const core = new Set(mockModuleExportNames(path.join(dir, "lib/module/mock.js")));
  const svgOnly = mockModuleExportNames(path.join(dir, "lib/module/mock-svg.js")).filter(
    (name) => !core.has(name),
  );
  expect(svgOnly.length).toBeGreaterThan(0);
  const module = reanimated().modules["react-native-reanimated"]!;
  const names = module.exportsFor!({ engine: "native", projectRoot: process.cwd() } as never);
  expect(names).toEqual(expect.arrayContaining(svgOnly));
});

it("is the preset's own module where the installed library cannot run its mock", () => {
  // A reanimated that ships mock.js but not the Jest resolvers its mock needs (before 4.7).
  const root = fs.mkdtempSync(path.join(fs.realpathSync(os.tmpdir()), "vn-lib-mock-"));
  afterAll(() => fs.rmSync(root, { recursive: true, force: true }));
  const pkg = path.join(root, "node_modules", "react-native-reanimated");
  fs.mkdirSync(path.join(pkg, "lib", "module"), { recursive: true });
  fs.writeFileSync(path.join(root, "package.json"), JSON.stringify({ name: "app" }));
  fs.writeFileSync(
    path.join(pkg, "package.json"),
    JSON.stringify({ name: "react-native-reanimated", version: "4.1.0" }),
  );
  fs.writeFileSync(path.join(pkg, "lib", "module", "mock.js"), "export const onlyInOldMock = 1;\n");
  const module = reanimated().modules["react-native-reanimated"]!;
  const names = module.exportsFor!({ engine: "native", projectRoot: root } as never);
  expect(names).not.toContain("onlyInOldMock");
  expect(names).toContain("useSharedValue");
});

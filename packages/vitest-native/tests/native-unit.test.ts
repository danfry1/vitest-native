import { describe, it, expect } from "vitest";
import path from "node:path";
import fs from "node:fs";
// @ts-expect-error — runtime .mjs, no types
import { transformRN } from "../src/native/transform.mjs";

// Resolve react-native's real on-disk location WITHOUT `require.resolve`: under
// the default (mock-engine) Vitest config the plugin intercepts `react-native/*`
// resolution even through node:module's createRequire, so we walk up node_modules
// and follow the symlink with realpathSync instead.
function resolveRNRoot(): string {
  let dir = process.cwd();
  for (;;) {
    const pkg = path.join(dir, "node_modules", "react-native", "package.json");
    if (fs.existsSync(pkg)) return path.dirname(fs.realpathSync(pkg));
    const parent = path.dirname(dir);
    if (parent === dir) throw new Error("react-native not found from " + process.cwd());
    dir = parent;
  }
}

const RN = resolveRNRoot();
const projectRoot = process.cwd();

describe("transformRN", () => {
  it("lowers RN 0.84 Flow component syntax to runnable JS", () => {
    const file = path.join(RN, "Libraries/Components/View/View.js");
    const src = fs.readFileSync(file, "utf8");
    expect(/\bcomponent\s+View\(/.test(src)).toBe(true); // source uses component syntax
    const out = transformRN(file, src, projectRoot);
    expect(out).not.toMatch(/\bcomponent\s+View\(/); // lowered
    expect(out).not.toMatch(/import typeof/);
  });

  it("returns identical output on a second (cached) call", () => {
    const file = path.join(RN, "Libraries/StyleSheet/StyleSheet.js");
    const src = fs.readFileSync(file, "utf8");
    const a = transformRN(file, src, projectRoot);
    const b = transformRN(file, src, projectRoot);
    expect(b).toBe(a);
  });
});

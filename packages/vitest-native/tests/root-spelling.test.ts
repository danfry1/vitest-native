/**
 * Which spelling of the project root a file is under (src/native/root-spelling.mjs). On
 * Windows a root spelled with an 8.3 short name (RUNNER~1) and the long names Vite gives
 * files are the same directory; on a case-insensitive disk, so are two letter cases,
 * which is how this is reproduced off Windows.
 */
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";
// @ts-expect-error — runtime .mjs, no types
import { relativeToRoot, rootSpellingOf } from "../src/native/root-spelling.mjs";

const real = fs.realpathSync.native(os.tmpdir());
const other = real.replace(/[a-z]/, (c) => c.toUpperCase());
const caseInsensitive = other !== real && fs.existsSync(other);

describe("root spelling", () => {
  it("finds the spelling a file is under, and its path relative to it", () => {
    const file = path.join(real, "app", "src", "a.ts");
    expect(rootSpellingOf(path.join(real, "app"), file)).toBe(path.join(real, "app"));
    expect(relativeToRoot(path.join(real, "app"), file)).toBe(path.join("src", "a.ts"));
    expect(rootSpellingOf(path.join(real, "app"), path.join(real, "application", "a.ts"))).toBeNull();
    expect(relativeToRoot(path.join(real, "app"), path.join(real, "b.ts"))).toBe(
      path.join("..", "b.ts"),
    );
  });

  it.runIf(caseInsensitive)("matches a file spelled as the root's real path, either way round", () => {
    const file = path.join(real, "a.ts");
    expect(rootSpellingOf(other, file)).toBe(real);
    expect(relativeToRoot(other, file)).toBe("a.ts");
    // A file on disk, spelled unlike any spelling of the root: its own leading directories.
    const dir = fs.mkdtempSync(path.join(real, "vn-root-spelling-"));
    try {
      fs.writeFileSync(path.join(dir, "a.ts"), "");
      const spelled = path.join(dir.replace(real, other), "a.ts");
      expect(rootSpellingOf(dir, spelled)).toBe(dir.replace(real, other));
      expect(relativeToRoot(dir, spelled)).toBe("a.ts");
    } finally {
      fs.rmSync(dir, { recursive: true, force: true });
    }
  });
});

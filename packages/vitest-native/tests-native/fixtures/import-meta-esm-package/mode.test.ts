import { expect, test } from "vitest";
import { mode } from "vn-import-meta-esm";

test("the package reads Vite's `import.meta.env`", () => {
  expect(mode).toBe("test");
});

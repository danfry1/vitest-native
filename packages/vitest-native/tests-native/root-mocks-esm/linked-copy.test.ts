// vn-esm-only-linked-consumer's copy of vn-esm-only-lib is linked from outside
// node_modules, as a workspace or `file:` dependency is. Jest matches a root mock by
// name, so that copy is mocked too (#899).
import fs from "node:fs";
import { createRequire } from "node:module";
import path from "node:path";
import { CID } from "vn-esm-only-linked-consumer";

it("serves the root mock to a copy linked from outside node_modules", () => {
  const consumer = path.dirname(
    createRequire(import.meta.url).resolve("vn-esm-only-linked-consumer/package.json"),
  );
  const copy = fs.realpathSync(path.join(consumer, "node_modules", "vn-esm-only-lib"));
  expect(copy.split(path.sep)).not.toContain("node_modules");
  expect(CID.parse("bafy").source).toBe("mock");
});

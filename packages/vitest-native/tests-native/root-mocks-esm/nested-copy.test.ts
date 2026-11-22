// vn-esm-only-nested-consumer imports vn-esm-only-lib/cid from its own nested copy of the
// package, a different file from the root copy's. Jest matches a root mock by name, so
// every copy is mocked (#898).
import fs from "node:fs";
import { createRequire } from "node:module";
import path from "node:path";
import { CID } from "vn-esm-only-lib/cid";
import { CID as nestedCID, parse } from "vn-esm-only-nested-consumer";

it("serves the root mock to an import from a nested copy of the package", () => {
  // The consumer has its own copy, so the root copy's mock alone would not reach it.
  const consumer = path.dirname(
    createRequire(import.meta.url).resolve("vn-esm-only-nested-consumer/package.json"),
  );
  const nested = path.join(consumer, "node_modules", "vn-esm-only-lib", "lib", "cid.js");
  expect(fs.readFileSync(nested, "utf8")).toContain('"real-v2"');
  expect(parse("bafy").source).toBe("mock");
  expect(nestedCID).toBe(CID);
});

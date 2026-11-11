// Run on its own (hot-esm-one-spelling.test.ts edits `include` to it): a test that fails
// inside the ES package, whose reported error names the package's own source.
import { boom } from "vn-esm-one-spelling";

test("fails inside the package", () => {
  boom();
});

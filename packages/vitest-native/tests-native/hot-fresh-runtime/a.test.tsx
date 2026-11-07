import { expect, it } from "vitest";
import { files, see } from "./record";

it("the first file records its React, RNTL and useId", async () => {
  const seen = await see();
  expect(seen.esmReact).toBe(seen.cjsReact);
  files.push(seen);
});

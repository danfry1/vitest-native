// TypeScript under node_modules, reached only through a peer edge.
import { expect, test } from "vitest";
import { hv } from "museum-esm-host";

test("ts under node_modules reached by a peer edge loads", () => {
  expect(hv).toBe("ts-peer-ok:1");
});

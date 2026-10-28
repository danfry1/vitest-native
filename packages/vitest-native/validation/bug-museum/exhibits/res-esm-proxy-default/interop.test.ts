import { expect, test } from "vitest";
import { callProxy } from "museum-esm-lib";

test("a default import of a Proxy-served module is its default", () => {
  expect(callProxy()).toBe("proxy-default");
});

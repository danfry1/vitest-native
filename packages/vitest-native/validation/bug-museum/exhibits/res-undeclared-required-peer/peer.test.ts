// museum-router (declared, compiled) requires museum-linking, its required peer, which
// nothing declares: the package manager installed it beside museum-router.
import { expect, test } from "vitest";
import { initialUrl } from "museum-router";

test("a required React Native peer nothing declares is compiled with the package that loads it", () => {
  expect(initialUrl).toBe("museum://home");
});

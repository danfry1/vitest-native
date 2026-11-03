/**
 * expo-router imported by plain test code, without its testing library. On Android its
 * toolbar requires .xml vector drawables, which Metro treats as assets.
 */
import { Link, Stack, useRouter } from "expo-router";
import { expect, it } from "vitest";

it("imports expo-router on the configured platform", () => {
  expect(typeof Stack).toBe("function");
  expect(Link).toBeDefined();
  expect(typeof useRouter).toBe("function");
});

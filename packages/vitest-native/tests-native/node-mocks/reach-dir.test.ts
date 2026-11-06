/**
 * A module Node loaded can name a mocked package by its directory, an absolute path
 * whose package is the mocked one. No project file is mocked here, so that is the only
 * way the request can be seen to reach the mock.
 */
import { createRequire } from "node:module";
import path from "node:path";
import { expect, it, vi } from "vitest";
import "dispatch-target-lib";
import { requireFrom } from "dispatch-consumer-lib";

const targetFile = createRequire(import.meta.url).resolve("dispatch-target-lib");

vi.mock("dispatch-target-lib", () => ({ source: "mock" }));

it("serves the mock for the package's directory", () => {
  expect(requireFrom(path.dirname(targetFile)).source).toBe("mock");
});

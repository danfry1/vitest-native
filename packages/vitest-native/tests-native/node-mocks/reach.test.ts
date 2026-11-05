/**
 * A module Node loaded can name a mocked file by a file URL. And a preset's deep path the real package does not have still reaches
 * the preset, with a project file mocked (which makes every request a candidate).
 */
import { createRequire } from "node:module";
import { pathToFileURL } from "node:url";
import { expect, it, vi } from "vitest";
import "dispatch-target-lib";
import "./local-thing";
import { importFrom } from "dispatch-consumer-lib";

const targetFile = createRequire(import.meta.url).resolve("dispatch-target-lib");

vi.mock("dispatch-target-lib", () => ({ source: "mock" }));
vi.mock("./local-thing", () => ({ local: "mock" }));

it("serves the mock for a file URL import", async () => {
  const mod = (await importFrom(pathToFileURL(targetFile).href)) as { source: string };
  expect(mod.source).toBe("mock");
});

it("leaves a preset's deep path to the preset", async () => {
  // A deep path the real package does not have, whose leaf the preset exports.
  const mod = (await importFrom("react-native-safe-area-context/SafeAreaView")) as Record<
    string,
    unknown
  >;
  expect(mod.SafeAreaView ?? (mod.default as Record<string, unknown>)?.SafeAreaView).toBeDefined();
});

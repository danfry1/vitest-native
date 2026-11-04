// Nothing here imports expo; the file only needs the native setup to have run.
import fs from "node:fs";
import { Platform } from "react-native";
import { expect, test } from "vitest";

const manifest = JSON.parse(fs.readFileSync(new URL("./package.json", import.meta.url), "utf8"));

test("Expo's runtime is installed exactly when the project compiles expo", () => {
  expect(Platform.OS).toBe("ios");
  // The control declares expo: then the runtime runs, compiled, as before.
  const declared = "expo" in manifest.dependencies;
  expect(
    (globalThis as { __museumExpoRuntime?: boolean }).__museumExpoRuntime === true,
    "Expo's runtime ran exactly when expo is declared",
  ).toBe(declared);
});

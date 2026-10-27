/**
 * Expo modules ship mocks of their own native modules (mocks/<Name>.ts), which
 * jest-expo serves. Under the engine they are served too, so these packages work with
 * no vi.mock: expo-file-system/legacy reads documentDirectory as it loads, and the
 * generic native-module stub answered it with a function, which made it throw.
 */
import * as Crypto from "expo-crypto";
import * as LegacyFileSystem from "expo-file-system/legacy";
import { expect, it } from "vitest";

it("loads a module that reads its native module at import time", () => {
  // expo-file-system's mock of this native module leaves documentDirectory out.
  // (jest-expo replaces expo-file-system/legacy with its own mock instead.)
  expect(LegacyFileSystem.documentDirectory).toBeNull();
});

it("answers with the values the package's mock returns", async () => {
  await expect(Crypto.digestStringAsync(Crypto.CryptoDigestAlgorithm.SHA256, "x")).resolves.toBe(
    "",
  );
  await expect(LegacyFileSystem.readAsStringAsync("file:///a")).resolves.toBe("");
});

it("records calls on the native module's mock functions", async () => {
  const native = (globalThis as { expo: { modules: Record<string, any> } }).expo.modules.ExpoCrypto;
  await Crypto.digestStringAsync(Crypto.CryptoDigestAlgorithm.SHA256, "y");
  expect(native.digestStringAsync).toHaveBeenCalledWith("SHA-256", "y", expect.anything());
});

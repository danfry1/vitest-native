import { createMMKV } from "react-native-mmkv";
import { expect, test } from "vitest";

// react-native-mmkv 3+ switches to its own in-memory backend when VITEST_WORKER_ID is
// set, so the mmkv preset steps aside and the real library runs: v4's API (`remove`)
// and change listeners included. v4 imports react-native-nitro-modules at load time,
// which the engine's Nitro boundary satisfies.
test("react-native-mmkv 4 runs its own test mode with its real API", () => {
  const storage = createMMKV({ id: "fixture" });
  const changed: string[] = [];
  const listener = storage.addOnValueChangedListener((key) => changed.push(key));

  storage.set("user", "ada");
  expect(storage.getString("user")).toBe("ada");
  storage.remove("user");
  expect(storage.getString("user")).toBeUndefined();
  expect(changed).toEqual(["user", "user"]);

  listener.remove();
});

// Importing Nitro itself, as mmkv does, reaches its compiled TypeScript source, whose
// require of its own package.json used to fail ("missed cache") once the Nitro
// boundary had required that manifest first.
test("react-native-nitro-modules imports under the native engine", async () => {
  const { NitroModules } = await import("react-native-nitro-modules");
  expect(NitroModules.hasHybridObject("MMKVFactory")).toBe(false);
});

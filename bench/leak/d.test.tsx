import { store } from "./store";
import { DeviceEventEmitter } from "react-native";

const FILE = "d";

// Class A — user-module singleton (Zustand/Redux/config-object shaped).
// A correct isolator re-evaluates ./store per file, so userCount starts at 0.
test(`[${FILE}] user-module store starts clean`, () => {
  expect(store.userCount).toBe(0);
  store.userCount += 1; // dirty it for the next file
});

// Class B — React Native's own stateful surface. RN is externalized in the
// native engine, so its listener registry lives in the worker's Node cache,
// NOT Vitest's module runner. A correct isolator still starts each file at 0.
test(`[${FILE}] RN DeviceEventEmitter starts clean`, () => {
  expect(DeviceEventEmitter.listenerCount("leak-probe")).toBe(0);
  DeviceEventEmitter.addListener("leak-probe", () => {}); // dirty it for the next file
});

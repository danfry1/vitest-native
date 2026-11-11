// A project setup file listed plainly in test.setupFiles, which imports react-native at
// its top level: it runs only after the engine's setup has installed its require hooks.
import { Platform, StyleSheet } from "react-native";

(globalThis as { __userSetup?: unknown }).__userSetup = {
  os: Platform.OS,
  style: StyleSheet.flatten([{ flex: 1 }, { opacity: 0.5 }]),
  // Under --mode compat-parallel, jest-compat's setup is listed ahead of this file.
  jest: typeof (globalThis as { jest?: { fn?: unknown } }).jest?.fn,
};

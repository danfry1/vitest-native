// A project setup file listed plainly in test.setupFiles, which reads react-native as its
// first statement: it runs only after the engine's setup has installed its require hooks.
// Read with require, not a static import, so that under 'parallel' the race against the
// engine's setup is lost every time on a build that does not order them.
import { createRequire } from "node:module";

const { Platform, StyleSheet } = createRequire(import.meta.url)("react-native");

(globalThis as { __userSetup?: unknown }).__userSetup = {
  os: Platform.OS,
  style: StyleSheet.flatten([{ flex: 1 }, { opacity: 0.5 }]),
  // Under --mode compat-parallel, jest-compat's setup is listed ahead of this file.
  jest: typeof (globalThis as { jest?: { fn?: unknown } }).jest?.fn,
};

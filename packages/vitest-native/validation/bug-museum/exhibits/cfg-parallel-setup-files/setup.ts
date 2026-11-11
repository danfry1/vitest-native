// An app setup file with no imports of its own, which reads React Native as its first
// statement, as a CommonJS-style setup does.
import { createRequire } from "node:module";

const { Platform } = createRequire(import.meta.url)("react-native");
(globalThis as { setupSawOS?: string }).setupSawOS = Platform.OS;

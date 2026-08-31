import { installGlobals } from "../../src/native/globals.mjs";

// Architecture experiment only: install the runtime globals React Native expects,
// without installing vitest-native's Node require/ESM hooks or registry. Any React
// Native module reached by the tests must therefore be evaluated by Vitest/Vite.
installGlobals();

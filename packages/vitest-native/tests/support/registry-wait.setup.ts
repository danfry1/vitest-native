// The plugin's config hook runs in these workers, where this suite's mock engine gives
// react-native a virtual id, so a test computes a different registry key from the one
// registry-warm.global.ts warms and compiles its own on a cold cache. Waiting for it, as
// the plugin did before the background build, keeps that compile inside the test that
// needs it (registry-process.test.ts and tests-native cover the background build itself).
// @ts-expect-error — runtime .mjs, no types
import { _setRegistryBuildOptions } from "../../src/native/registry-process.mjs";

_setRegistryBuildOptions({ wait: true });

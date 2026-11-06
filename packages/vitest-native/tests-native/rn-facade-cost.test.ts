/**
 * The react-native facade reads each export when a test uses it (#528), so a file that
 * imports one component runs only the React Native modules that component needs. Bound
 * loosely: 19 of 440 modules ran on React Native 0.88 when this was written, against 365
 * with the facade that bound every export at load. A regression to eager binding, or a
 * setup file that starts touching the whole index, crosses it.
 */
import { createRequire } from "node:module";
import path from "node:path";
import { View } from "react-native";
import { expect, it } from "vitest";
import { projectContext } from "../src/context.mjs";

const MAX_MODULES = 60;

const req = createRequire(
  path.join(projectContext()?.projectRoot ?? process.cwd(), "package.json"),
);

// Without the precompiled registry there is nothing to count.
it.skipIf(process.env.VITEST_NATIVE_NO_REGISTRY === "1")(
  `runs at most ${MAX_MODULES} React Native modules for a file that imports only View`,
  () => {
    expect(View).toBeDefined();
    const file = projectContext()?.registry;
    expect(file, "the precompiled React Native registry").toBeTruthy();
    const ran = (req(file!).__vitestNativeRegistry as { ran(): string[] }).ran();
    expect(ran.length).toBeLessThanOrEqual(MAX_MODULES);
  },
);

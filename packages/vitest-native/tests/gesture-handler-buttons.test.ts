// The Gesture Handler button mocks (src/native/gesture-handler-buttons.mjs) register after
// the package's own jestSetup.js and name its files by path: both must stay what the
// installed package has.
import fs from "node:fs";
import { createRequire } from "node:module";
import path from "node:path";
import { expect, it } from "vitest";
import {
  GESTURE_HANDLER_SETUP,
  registerGestureHandlerButtons,
} from "../src/native/gesture-handler-buttons.mjs";
import { LIBRARY_SETUP_FILES } from "../src/preset-map.js";

const require = createRequire(import.meta.url);
const dir = path.dirname(require.resolve("react-native-gesture-handler/package.json"));

it("runs after the setup file the native engine runs for gesture-handler", () => {
  expect(GESTURE_HANDLER_SETUP).toBe(LIBRARY_SETUP_FILES.gestureHandler);
});

it("names only files the installed package has, in its source and its build", () => {
  const specs: string[] = [];
  const support = { mock: (spec: string) => specs.push(spec), requireActual: () => ({}) };
  registerGestureHandlerButtons(support);
  // The factories also load these, from the same base as the mock they build.
  for (const base of ["./src", "./lib/module"]) specs.push(`${base}/jestUtils`, `${base}/State`);
  const missing = specs.filter((spec) => {
    const file = path.join(dir, spec);
    return ![".ts", ".tsx", ".js", "/index.ts", "/index.js"].some((ext) =>
      fs.existsSync(file + ext),
    );
  });
  expect(specs).toHaveLength(8);
  expect(missing).toEqual([]);
});

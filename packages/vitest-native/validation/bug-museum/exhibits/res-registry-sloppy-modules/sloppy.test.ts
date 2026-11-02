import { expect, it } from "vitest";
import { Platform } from "react-native";

// Platform.ios.js has no "use strict" (React Native's Babel preset compiles with
// strictMode: false), so Node and Jest run it sloppy: its `constants` getter caches into
// `this.__constants`, and on a frozen receiver that write fails silently.
it("runs a sloppy React Native module sloppy, as Jest does", () => {
  const frozen = Object.freeze(Object.assign(Object.create(Platform), { __constants: null }));
  expect(frozen.constants).toBeNull();
});

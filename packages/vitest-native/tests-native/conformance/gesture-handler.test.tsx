/**
 * react-native-gesture-handler as the native engine serves it (the real package with its
 * own jestSetup.js, presets/preset-map.ts LIBRARY_SETUP_FILES) against the API the
 * installed package declares. See probe.tsx; waivers in gesture-handler.waivers.json.
 */
import fs from "node:fs";
import path from "node:path";
import React from "react";
import * as GestureHandler from "react-native-gesture-handler";
import { extractContract } from "../../scripts/conformance/extract-contract.mjs";
import { probeModule, type Waiver } from "./probe";

const packageRoot = path.resolve(import.meta.dirname, "../..");
const waivers: Waiver[] = JSON.parse(
  fs.readFileSync(path.join(import.meta.dirname, "gesture-handler.waivers.json"), "utf8"),
);

probeModule(
  GestureHandler as unknown as Record<string, unknown>,
  extractContract("react-native-gesture-handler", packageRoot),
  waivers,
  {
    wrapper: (children) => (
      <GestureHandler.GestureHandlerRootView>{children}</GestureHandler.GestureHandlerRootView>
    ),
  },
);

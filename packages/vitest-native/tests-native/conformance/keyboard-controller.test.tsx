/**
 * react-native-keyboard-controller as the native engine serves it (the library's own Jest
 * mock, presets/preset-map.ts) against the API the installed package declares. See
 * probe.tsx; waivers in keyboard-controller.waivers.json.
 */
import fs from "node:fs";
import path from "node:path";
import * as KeyboardController from "react-native-keyboard-controller";
import { extractContract } from "../../scripts/conformance/extract-contract.mjs";
import { probeModule, type Waiver } from "./probe";

const packageRoot = path.resolve(import.meta.dirname, "../..");
const waivers: Waiver[] = JSON.parse(
  fs.readFileSync(
    path.join(
      import.meta.dirname,
      process.env.VN_CONFORMANCE_ENGINE === "mock"
        ? "keyboard-controller.mock-waivers.json"
        : "keyboard-controller.waivers.json",
    ),
    "utf8",
  ),
);

probeModule(
  KeyboardController as unknown as Record<string, unknown>,
  extractContract("react-native-keyboard-controller", packageRoot),
  waivers,
  {
    wrapper: (children) => (
      <KeyboardController.KeyboardProvider>{children}</KeyboardController.KeyboardProvider>
    ),
  },
);

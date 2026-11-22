/**
 * react-native-screens as the native engine serves it (the screens preset,
 * presets/screens.ts) against the API the installed package declares. See probe.tsx;
 * waivers in screens.waivers.json.
 */
import fs from "node:fs";
import path from "node:path";
import * as Screens from "react-native-screens";
import { extractContract } from "../../scripts/conformance/extract-contract.mjs";
import { probeModule, type Waiver } from "./probe";

const packageRoot = path.resolve(import.meta.dirname, "../..");
const waivers: Waiver[] = JSON.parse(
  fs.readFileSync(
    path.join(
      import.meta.dirname,
      process.env.VN_CONFORMANCE_ENGINE === "mock"
        ? "screens.mock-waivers.json"
        : "screens.waivers.json",
    ),
    "utf8",
  ),
);

probeModule(
  Screens as unknown as Record<string, unknown>,
  extractContract("react-native-screens", packageRoot),
  waivers,
);

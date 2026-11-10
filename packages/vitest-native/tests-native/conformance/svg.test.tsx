/**
 * react-native-svg as the native engine serves it, against the API the installed package declares.
 * See probe.tsx; waivers in svg.waivers.json (native) and svg.mock-waivers.json (mock).
 */
import fs from "node:fs";
import path from "node:path";
import * as Served from "react-native-svg";
import { extractContract } from "../../scripts/conformance/extract-contract.mjs";
import { probeModule, type Waiver } from "./probe";

const packageRoot = path.resolve(import.meta.dirname, "../..");
const waivers: Waiver[] = JSON.parse(
  fs.readFileSync(
    path.join(
      import.meta.dirname,
      process.env.VN_CONFORMANCE_ENGINE === "mock" ? "svg.mock-waivers.json" : "svg.waivers.json",
    ),
    "utf8",
  ),
);

probeModule(
  Served as unknown as Record<string, unknown>,
  extractContract("react-native-svg", packageRoot),
  waivers,
);

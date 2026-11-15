/**
 * @shopify/flash-list as the native engine serves it, against the API the installed package declares.
 * See probe.tsx; waivers in flash-list.waivers.json (native) and flash-list.mock-waivers.json (mock).
 */
import fs from "node:fs";
import path from "node:path";
import * as Served from "@shopify/flash-list";
import { extractContract } from "../../scripts/conformance/extract-contract.mjs";
import { probeModule, type Waiver } from "./probe";

const packageRoot = path.resolve(import.meta.dirname, "../..");
const waivers: Waiver[] = JSON.parse(
  fs.readFileSync(
    path.join(
      import.meta.dirname,
      process.env.VN_CONFORMANCE_ENGINE === "mock"
        ? "flash-list.mock-waivers.json"
        : "flash-list.waivers.json",
    ),
    "utf8",
  ),
);

probeModule(
  Served as unknown as Record<string, unknown>,
  extractContract("@shopify/flash-list", packageRoot),
  waivers,
);

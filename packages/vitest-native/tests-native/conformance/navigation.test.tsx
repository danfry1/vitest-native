/**
 * @react-navigation/native as the native engine serves it (the navigation preset, presets/navigation.ts)
 * against the API the installed package declares. See probe.tsx; waivers in
 * navigation.waivers.json.
 */
import fs from "node:fs";
import path from "node:path";
import * as Navigation from "@react-navigation/native";
import { NavigationContainer } from "@react-navigation/native";
import { extractContract } from "../../scripts/conformance/extract-contract.mjs";
import { probeModule, type Waiver } from "./probe";

const packageRoot = path.resolve(import.meta.dirname, "../..");
const waivers: Waiver[] = JSON.parse(
  fs.readFileSync(
    path.join(
      import.meta.dirname,
      process.env.VN_CONFORMANCE_ENGINE === "mock"
        ? "navigation.mock-waivers.json"
        : "navigation.waivers.json",
    ),
    "utf8",
  ),
);

probeModule(
  Navigation as unknown as Record<string, unknown>,
  extractContract("@react-navigation/native", packageRoot),
  waivers,
  {
    // An effect callback returns nothing or its cleanup: the generic `() => ({})` would hand
    // React an object as the cleanup.
    args: { useFocusEffect: () => [() => undefined] },
    wrapper: (children) => <NavigationContainer>{children}</NavigationContainer>,
  },
);

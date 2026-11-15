/**
 * @react-navigation/native-stack as the native engine serves it (the navigation preset, presets/navigation.ts)
 * against the API the installed package declares. See probe.tsx; waivers in
 * native-stack.waivers.json.
 */
import fs from "node:fs";
import path from "node:path";
import * as NativeStack from "@react-navigation/native-stack";
import { NavigationContainer } from "@react-navigation/native";
import { extractContract } from "../../scripts/conformance/extract-contract.mjs";
import { probeModule, type Waiver } from "./probe";

const packageRoot = path.resolve(import.meta.dirname, "../..");
const waivers: Waiver[] = JSON.parse(
  fs.readFileSync(
    path.join(
      import.meta.dirname,
      process.env.VN_CONFORMANCE_ENGINE === "mock"
        ? "native-stack.mock-waivers.json"
        : "native-stack.waivers.json",
    ),
    "utf8",
  ),
);

probeModule(
  NativeStack as unknown as Record<string, unknown>,
  extractContract("@react-navigation/native-stack", packageRoot),
  waivers,
  { wrapper: (children) => <NavigationContainer>{children}</NavigationContainer> },
);

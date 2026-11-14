/**
 * react-native-safe-area-context as the native engine serves it, against the API the installed package declares.
 * See probe.tsx; waivers in safe-area-context.waivers.json (native) and safe-area-context.mock-waivers.json (mock).
 */
import fs from "node:fs";
import React from "react";
import path from "node:path";
import * as Served from "react-native-safe-area-context";
import { extractContract } from "../../scripts/conformance/extract-contract.mjs";
import { probeModule, type Waiver } from "./probe";

const packageRoot = path.resolve(import.meta.dirname, "../..");
const waivers: Waiver[] = JSON.parse(
  fs.readFileSync(
    path.join(
      import.meta.dirname,
      process.env.VN_CONFORMANCE_ENGINE === "mock"
        ? "safe-area-context.mock-waivers.json"
        : "safe-area-context.waivers.json",
    ),
    "utf8",
  ),
);

probeModule(
  Served as unknown as Record<string, unknown>,
  extractContract("react-native-safe-area-context", packageRoot),
  waivers,
  {
    // Its hooks read the provider's values, as an app renders them under one.
    wrapper: (children) => (
      <Served.SafeAreaProvider
        initialMetrics={{
          frame: { x: 0, y: 0, width: 390, height: 844 },
          insets: { top: 47, left: 0, right: 0, bottom: 34 },
        }}
      >
        {children}
      </Served.SafeAreaProvider>
    ),
  },
);

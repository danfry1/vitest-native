/**
 * @gorhom/bottom-sheet as the native engine serves it (the library's own Jest mock,
 * `@gorhom/bottom-sheet/mock`, presets/bottom-sheet.ts) against the API the installed
 * package declares. See probe.tsx; waivers in bottom-sheet.waivers.json.
 */
import fs from "node:fs";
import path from "node:path";
import { ScrollView } from "react-native";
import * as BottomSheet from "@gorhom/bottom-sheet";
import { extractContract } from "../../scripts/conformance/extract-contract.mjs";
import { probeModule, type Waiver } from "./probe";

const packageRoot = path.resolve(import.meta.dirname, "../..");
const waivers: Waiver[] = JSON.parse(
  fs.readFileSync(
    path.join(
      import.meta.dirname,
      process.env.VN_CONFORMANCE_ENGINE === "mock"
        ? "bottom-sheet.mock-waivers.json"
        : "bottom-sheet.waivers.json",
    ),
    "utf8",
  ),
);

probeModule(
  BottomSheet as unknown as Record<string, unknown>,
  extractContract("@gorhom/bottom-sheet", packageRoot),
  waivers,
  {
    // The mock returns the component it is given; the generic `{}` would come back as is.
    args: { createBottomSheetScrollableComponent: () => [0, ScrollView] },
    // The package's default export is the BottomSheet class component, which renders.
    noCall: { default: "a class component" },
    wrapper: (children) => (
      <BottomSheet.BottomSheetModalProvider>{children}</BottomSheet.BottomSheetModalProvider>
    ),
  },
);

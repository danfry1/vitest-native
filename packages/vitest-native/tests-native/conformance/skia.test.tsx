/**
 * @shopify/react-native-skia as the native engine serves it, against the API the installed package declares.
 * See probe.tsx; waivers in skia.waivers.json (native) and skia.mock-waivers.json (mock).
 */
import fs from "node:fs";
import path from "node:path";
import * as Served from "@shopify/react-native-skia";
import { makeMutable } from "react-native-reanimated";
import { extractContract } from "../../scripts/conformance/extract-contract.mjs";
import { probeModule, type Waiver } from "./probe";

const packageRoot = path.resolve(import.meta.dirname, "../..");
const waivers: Waiver[] = JSON.parse(
  fs.readFileSync(
    path.join(
      import.meta.dirname,
      process.env.VN_CONFORMANCE_ENGINE === "mock" ? "skia.mock-waivers.json" : "skia.waivers.json",
    ),
    "utf8",
  ),
);

const { Skia } = Served;
const rect = () => Skia.XYWHRect(0, 0, 10, 10);

probeModule(
  Served as unknown as Record<string, unknown>,
  extractContract("@shopify/react-native-skia", packageRoot),
  waivers,
  {
    // Geometry helpers take Skia values or props of the declared shapes, which `{}` is not.
    args: {
      deflate: () => [Skia.RRectXY(rect(), 2, 2), 1, 1],
      inflate: () => [Skia.RRectXY(rect(), 2, 2), 1, 1],
      processCircle: () => [{ cx: 0, cy: 0, r: 5 }],
      processRadius: () => [Skia, 5],
      select: () => [makeMutable({ x: 1 }), "x"],
      useVideo: () => ["video.mp4"],
      processRect: () => [{ x: 0, y: 0, width: 10, height: 10 }],
      processPath: () => ["M0 0 L10 10"],
      processGradientProps: () => [{ transform: [{ scale: 1 }] }],
    },
  },
);

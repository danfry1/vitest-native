/**
 * @shopify/react-native-skia as the native engine serves it, against the API the installed package declares.
 * See probe.tsx; waivers in skia.waivers.json (native) and skia.mock-waivers.json (mock).
 */
import React from "react";
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

const { Fill, Skia } = Served;
const rect = () => Skia.XYWHRect(0, 0, 10, 10);
// A data source Node's fetch loads offline (a 1x1 PNG): the loaders' `source` parameter is
// a URL or a required asset, and an empty one makes their fetch reject after the test.
const PNG =
  "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==";
const SVG = "data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg'/>";

probeModule(
  Served as unknown as Record<string, unknown>,
  extractContract("@shopify/react-native-skia", packageRoot),
  waivers,
  {
    // Geometry helpers take Skia values or props of the declared shapes, which `{}` is not.
    args: {
      deflate: () => [Skia, Skia.RRectXY(rect(), 2, 2), 1, 1],
      inflate: () => [Skia, Skia.RRectXY(rect(), 2, 2), 1, 1],
      processRect: () => [Skia, { x: 0, y: 0, width: 10, height: 10 }],
      processPath: () => [Skia, "M0 0 L10 10"],
      processGradientProps: () => [Skia, { colors: ["red", "blue"], transform: [{ scale: 1 }] }],
      processColor: () => [Skia, "red"],
      processTransform: () => [Skia.Matrix(), [{ scale: 1 }]],
      enumKey: () => ["fill"],
      // Interpolations need at least two input and output values.
      interpolate: () => [0.5, [0, 1], [0, 10]],
      interpolateColors: () => [0.5, [0, 1], ["red", "blue"]],
      interpolatePaths: () => [
        0.5,
        [0, 1],
        [Skia.Path.MakeFromSVGString("M0 0 L10 10"), Skia.Path.MakeFromSVGString("M0 0 L20 20")],
      ],
      interpolateVector: () => [
        0.5,
        [0, 1],
        [
          { x: 0, y: 0 },
          { x: 10, y: 10 },
        ],
      ],
      // Type guards read the Skia object they are given.
      isColorFilter: () => [Skia.Paint()],
      isImageFilter: () => [Skia.Paint()],
      isMaskFilter: () => [Skia.Paint()],
      isPaint: () => [Skia.Paint()],
      isPath: () => [Skia.Path.Make()],
      isPathEffect: () => [Skia.Paint()],
      isShader: () => [Skia.Paint()],
      useCollectionLoading: () => [[PNG], () => Promise.resolve([null])],
      processCircle: () => [{ cx: 0, cy: 0, r: 5 }],
      processRadius: () => [Skia, 5],
      select: () => [makeMutable({ x: 1 }), "x"],
      useVideo: () => ["video.mp4"],
      loadData: () => [PNG, () => null],
      useRawData: () => [PNG, () => null],
      useData: () => [PNG],
      useImage: () => [PNG],
      useAnimatedImage: () => [PNG],
      useAnimatedImageValue: () => [PNG],
      useImageAsTexture: () => [PNG],
      // A drawing and a size Skia can render offscreen. Made-up ones (an element `{}`, a
      // 0×0 size) left Skia's own React root with failing work that RNTL 14's act flushed
      // during the NEXT export's render, so the next export's result went unchecked.
      useTexture: () => [<Fill color="red" />, { width: 1, height: 1 }],
      usePictureAsTexture: () => [
        Served.createPicture((canvas) => canvas.drawColor(Skia.Color("red")), {
          width: 1,
          height: 1,
        }),
        { width: 1, height: 1 },
      ],
      useTypeface: () => [PNG],
      useSVG: () => [SVG],
    },
    noCall: {
      makeImageFromView: "snapshots a mounted native view, which a probe does not have",
      isNativeBufferWeb:
        "checks the buffer against the browser's DOM classes, which Node does not have",
    },
  },
);

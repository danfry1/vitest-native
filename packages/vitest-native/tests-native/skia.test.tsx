/**
 * Skia under the native engine, zero-config: it is installed (a devDependency) under
 * both its names, `react-native-skia` 3.x and `@shopify/react-native-skia` 2.14, so
 * its preset is auto-detected and shadows each.
 *
 * The real package throws at import in Node ("Native Skia Module failed to correctly
 * install JSI Bindings"). The preset serves Skia's own test mock over CanvasKit, so
 * the Skia API computes with real Skia and the Canvas renders as a View.
 */
import { describe, it, expect } from "vitest";
import React from "react";
import { render, screen } from "@testing-library/react-native";
import { Text } from "react-native";
import {
  Canvas,
  Circle,
  Skia,
  matchFont,
  usePathValue,
  listFontFamilies,
} from "@shopify/react-native-skia";
import { createRequire } from "node:module";
import { Skia as Skia3, SkiaGraphiteView } from "react-native-skia";
import * as skia2 from "@shopify/react-native-skia";
import * as skia3 from "react-native-skia";

describe("Skia (preset, native engine)", () => {
  it("has CanvasKit loaded before user setup files run", () => {
    expect((globalThis as any).__vnCanvasKitAtUserSetup).toBe(true);
  });

  it("computes with real Skia", () => {
    const path = Skia.Path.Rect(Skia.XYWHRect(0, 0, 10, 20));
    const bounds = path.computeTightBounds();
    expect([bounds.x, bounds.y, bounds.width, bounds.height]).toEqual([0, 0, 10, 20]);
    expect(path.contains(5, 5)).toBe(true);
    // CanvasKit's own serialisation, which closes the contour explicitly.
    expect(Skia.Path.MakeFromSVGString("M0 0 L10 0 L10 10 Z")!.toSVGString()).toBe(
      "M0 0L10 0L10 10L0 0Z",
    );
    expect(Array.from(Skia.Color("red"))).toEqual([1, 0, 0, 1]);
  });

  it("renders a Canvas and its drawing as React Native Views", async () => {
    await render(
      <Canvas testID="canvas" style={{ width: 20, height: 20 }}>
        <Circle cx={10} cy={10} r={8} color="red" />
      </Canvas>,
    );
    expect(screen.getByTestId("canvas")).toHaveStyle({ width: 20, height: 20 });
  });

  it("matches a font of the requested size, as a device does", () => {
    // Over CanvasKit, which has no system fonts, Skia's own matchFont throws.
    expect(matchFont({ fontFamily: "Helvetica", fontSize: 18 }).getSize()).toBe(18);
    expect(matchFont().getSize()).toBe(14);
    expect(listFontFamilies()).toEqual([]);
  });

  it("runs Skia's Reanimated helpers over the reanimated preset", async () => {
    let svg = "";
    function Probe() {
      const path = usePathValue((p) => {
        "worklet";
        p.moveTo(0, 0);
        p.lineTo(5, 5);
      });
      svg = path.value.toSVGString();
      return <Text>probe</Text>;
    }
    await render(<Probe />);
    expect(svg).toBe("M0 0L5 5");
  });

  it("serves Skia under its current name, react-native-skia, to import and require()", () => {
    expect(Skia3.Path.Rect(Skia3.XYWHRect(0, 0, 3, 4)).computeTightBounds().height).toBe(4);
    expect(SkiaGraphiteView).toBeDefined();
    expect(createRequire(import.meta.url)("react-native-skia").Skia).toBe(Skia3);
  });

  it("imports each installed version's own exports, each of which its mock provides", () => {
    // The plugin reads the names from the installed version while it resolves its
    // config (checked against Skia's own ESM build in tests/skia-preset.test.tsx);
    // reading them here would load Vite into the test worker.
    const provided = JSON.parse(process.env.VITEST_NATIVE_PRESET_EXPORTS ?? "{}");
    for (const [name, ns] of [
      ["react-native-skia", skia3],
      ["@shopify/react-native-skia", skia2],
    ] as const) {
      const names = Object.keys(ns).filter((n) => n !== "default");
      // The ESM module is built from the plugin's list, through the environment.
      expect(names.sort(), name).toEqual(provided[name]);
      expect(
        names.filter((n) => (ns as Record<string, unknown>)[n] === undefined),
        name,
      ).toEqual([]);
    }
    // 2.15.0 added SkiaGraphiteView, so one version's list is wrong for the other.
    expect("SkiaGraphiteView" in skia3).toBe(true);
    expect("SkiaGraphiteView" in skia2).toBe(false);
  });
});

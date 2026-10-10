/**
 * @shopify/react-native-skia under the native engine, zero-config: the package is
 * installed (a devDependency), so its preset is auto-detected and shadows it.
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
import { SKIA_EXPORTS, SKIA_MOCK_ONLY } from "../src/presets/skia-exports.js";

describe("@shopify/react-native-skia (preset, native engine)", () => {
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

  it("declares exactly the names its factory builds that the real package exports", () => {
    const module = (globalThis as any).__vitest_native_preset_mocks["@shopify/react-native-skia"];
    const built = Object.keys(module).sort();
    expect([...SKIA_EXPORTS, ...SKIA_MOCK_ONLY].sort()).toEqual(built);
  });
});

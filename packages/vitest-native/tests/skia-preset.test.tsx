/**
 * The skia preset under the mock engine, zero-config: @shopify/react-native-skia is a
 * devDependency, so the preset is auto-detected. Its module needs CanvasKit, which
 * loads asynchronously; the mock engine's setup cannot await (it is also built as
 * CommonJS), so the virtual module for the package awaits the preparation instead.
 * The native engine's coverage is tests-native/skia.test.tsx.
 */
import { createRequire } from "node:module";
import React from "react";
import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react-native";
import { Canvas, Circle, Skia, matchFont } from "@shopify/react-native-skia";
import { AUTO_DETECT_PRESETS, PRESET_MODULES } from "../src/preset-map.js";
import { untilPrepared } from "../src/preset-preparation.js";
import { skia } from "../src/presets/skia.js";

const SKIA = "@shopify/react-native-skia";

describe("skia preset: wiring", () => {
  it("is auto-detected for the package and shadows exactly it", () => {
    expect(AUTO_DETECT_PRESETS[SKIA]).toBe("skia");
    expect(Object.keys(skia().modules)).toEqual([...PRESET_MODULES.skia]);
  });

  it("says what to do when its module is built before CanvasKit loads", () => {
    const g = globalThis as any;
    const canvasKit = g.CanvasKit;
    delete g.CanvasKit;
    try {
      expect(() => skia().modules[SKIA].factory()).toThrow(/before CanvasKit loaded/);
    } finally {
      g.CanvasKit = canvasKit;
    }
  });
});

describe("skia preset under the mock engine", () => {
  it("computes with real Skia", () => {
    const bounds = Skia.Path.Rect(Skia.XYWHRect(0, 0, 10, 20)).computeTightBounds();
    expect([bounds.width, bounds.height]).toEqual([10, 20]);
  });

  it("renders a Canvas and its drawing", async () => {
    await render(
      <Canvas testID="canvas">
        <Circle cx={1} cy={1} r={1} />
      </Canvas>,
    );
    expect(screen.getByTestId("canvas")).toBeTruthy();
    expect(matchFont({ fontSize: 12 }).getSize()).toBe(12);
  });

  it("answers require() with the same module once prepared", () => {
    const required = createRequire(import.meta.url)(SKIA);
    expect(required.Skia).toBe(Skia);
    expect(required.Canvas).toBe(Canvas);
  });
});

describe("untilPrepared", () => {
  it("names the package and the fix before the module exists", () => {
    const module = untilPrepared("some-package", () => undefined);
    expect(() => module.anything).toThrow(
      /'some-package' was required before its preset finished preparing/,
    );
  });

  it("forwards reads, writes and key queries once the module exists", () => {
    let built: Record<string, any> | undefined;
    const module = untilPrepared("some-package", () => built);
    built = { a: 1 };
    expect(module.a).toBe(1);
    module.b = 2;
    expect(built.b).toBe(2);
    expect("a" in module).toBe(true);
    expect(Object.keys(module)).toEqual(["a", "b"]);
    expect({ ...module }).toEqual({ a: 1, b: 2 });
  });
});

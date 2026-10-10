/**
 * The unistyles preset against the library it shadows.
 *
 * Two references, both from the installed react-native-unistyles:
 * - its own Jest mock (`react-native-unistyles/mocks`), which a Jest suite migrating
 *   here was written against. It is executed with a stand-in `jest.mock` that keeps
 *   the factories it registers, and the preset must agree with it wherever it has an
 *   opinion: every export it provides, the theme, resolved stylesheets, `mq`.
 * - the library's own JS for what that mock leaves out, ported in the preset:
 *   variants (src/web/variants.ts), theme selection and its errors (the device
 *   runtime in cxx/), and media queries (src/mq.ts, src/hooks/useMedia.native.ts).
 */
import fs from "node:fs";
import { createRequire } from "node:module";
import path from "node:path";
import React from "react";
import { describe, expect, it } from "vitest";
import { AUTO_DETECT_PRESETS, PRESET_MODULES } from "../src/preset-map.js";
import { unistyles } from "../src/presets/unistyles.js";

const PACKAGE = "react-native-unistyles";
const require = createRequire(import.meta.url);
const packageDir = path.dirname(require.resolve(`${PACKAGE}/package.json`));

function moduleFor(): Record<string, any> {
  return unistyles().modules[PACKAGE].factory();
}

/** The official mock's `react-native-unistyles` module, built fresh. */
function officialMock(): Record<string, any> {
  const factories = new Map<string, () => Record<string, any>>();
  const g = globalThis as any;
  const previousJest = g.jest;
  delete g.__UNISTYLES_MOCK_REGISTRY__;
  g.jest = {
    mock: (name: string, factory: () => Record<string, any>) => factories.set(name, factory),
  };
  const file = path.join(packageDir, "lib/commonjs/mocks.js");
  try {
    delete require.cache[file];
    require(file);
  } finally {
    if (previousJest === undefined) delete g.jest;
    else g.jest = previousJest;
  }
  const factory = factories.get(PACKAGE);
  if (!factory) throw new Error(`${file} registered no mock for ${PACKAGE}`);
  return factory();
}

const themes = {
  light: { colors: { background: "#fff", text: "#111" }, gap: (n: number) => n * 8 },
  dark: { colors: { background: "#000", text: "#eee" }, gap: (n: number) => n * 8 },
};
const breakpoints = { xs: 0, sm: 300, md: 500, lg: 800 };

describe("unistyles preset: wiring", () => {
  it("is auto-detected for the package and shadows it and its reanimated entry", () => {
    expect(AUTO_DETECT_PRESETS[PACKAGE]).toBe("unistyles");
    expect(Object.keys(unistyles().modules)).toEqual([...PRESET_MODULES.unistyles]);
  });

  it("declares every export its factory builds, and nothing more", () => {
    for (const [name, mod] of Object.entries(unistyles().modules)) {
      expect(Object.keys(mod.factory()).sort(), name).toEqual([...mod.exports].sort());
    }
  });
});

describe("unistyles preset: agrees with the library's own Jest mock", () => {
  it("provides every export the official mock does", () => {
    const missing = Object.keys(officialMock()).filter((name) => !(name in moduleFor()));
    expect(missing).toEqual([]);
  });

  it("resolves the same theme, stylesheet and dynamic styles", () => {
    const official = officialMock();
    const ours = moduleFor();
    for (const m of [official, ours]) m.StyleSheet.configure({ themes: { light: themes.light } });

    const sheet = (theme: (typeof themes)["light"]) => ({
      container: { backgroundColor: theme.colors.background, padding: theme.gap(2) },
      label: (bold: boolean) => ({ color: theme.colors.text, fontWeight: bold ? "700" : "400" }),
    });
    const a = official.StyleSheet.create(sheet);
    const b = ours.StyleSheet.create(sheet);
    expect(b.container).toEqual(a.container);
    expect(b.label(true)).toEqual(a.label(true));
    expect(ours.useUnistyles().theme).toBe(official.useUnistyles().theme);

    const fixed = { box: { width: 10 } };
    expect(ours.StyleSheet.create(fixed).box).toEqual(official.StyleSheet.create(fixed).box);
    expect(ours.StyleSheet.absoluteFill).toEqual(official.StyleSheet.absoluteFill);
  });

  it("builds the same media query strings", () => {
    const official = officialMock();
    const ours = moduleFor();
    // The official mock's mq returns placeholders; the library's own src/mq.ts is the
    // reference for the strings, so compare against its documented format instead.
    expect(typeof official.mq.only.width).toBe("function");
    ours.StyleSheet.configure({ themes: { light: themes.light }, breakpoints });
    expect(ours.mq.only.width("sm", "lg")).toBe(":w[300, 800]");
    expect(ours.mq.only.width(200)).toBe(":w[200, Infinity]");
    expect(ours.mq.only.height(null, 600)).toBe(":h[0, 600]");
    expect(ours.mq.width("md").and.height(100, 400)).toBe(":w[500, Infinity]:h[100, 400]");
    expect(ours.mq.height(100).and.width("sm")).toBe(":w[300, Infinity]:h[100, Infinity]");
  });

  it("strips variant keys from a style the way the official mock does", () => {
    const official = officialMock();
    const ours = moduleFor();
    const sheet = {
      button: {
        padding: 4,
        variants: { size: { small: { padding: 2 }, large: { padding: 8 } } },
      },
    };
    expect(official.StyleSheet.create(sheet).button).toEqual({ padding: 4 });
    // No variant selected and no `default` option: the base style alone.
    expect(ours.StyleSheet.create(sheet).button).toEqual({ padding: 4 });
  });
});

describe("unistyles preset: variants (src/web/variants.ts)", () => {
  const sheet = {
    button: {
      padding: 4,
      backgroundColor: "grey",
      variants: {
        size: { small: { padding: 2 }, large: { padding: 8 }, default: { padding: 6 } },
        primary: { true: { backgroundColor: "blue" }, false: { backgroundColor: "white" } },
      },
      compoundVariants: [{ size: "large", primary: true, styles: { borderWidth: 2 } }],
    },
    label: (text: string) => ({
      color: "black",
      variants: { primary: { true: { color: "white" } } },
      fontFamily: text,
    }),
  };

  it("applies each group's `default` option until a variant is selected", () => {
    const styles = moduleFor().StyleSheet.create(sheet);
    expect(styles.button).toEqual({ padding: 6, backgroundColor: "grey" });
  });

  it("applies the selected options, booleans included", () => {
    const styles = moduleFor().StyleSheet.create(sheet);
    styles.useVariants({ size: "small", primary: false });
    expect(styles.button).toEqual({ padding: 2, backgroundColor: "white" });
  });

  it("applies a compound variant only when every condition matches", () => {
    const styles = moduleFor().StyleSheet.create(sheet);
    styles.useVariants({ size: "large", primary: true });
    expect(styles.button).toEqual({ padding: 8, backgroundColor: "blue", borderWidth: 2 });
    styles.useVariants({ size: "large", primary: false });
    expect(styles.button).toEqual({ padding: 8, backgroundColor: "white" });
  });

  it("applies variants to a dynamic style's result", () => {
    const styles = moduleFor().StyleSheet.create(sheet);
    styles.useVariants({ primary: true });
    expect(styles.label("Inter")).toEqual({ color: "white", fontFamily: "Inter" });
  });
});

describe("unistyles preset: themes (device runtime rules)", () => {
  it("selects the only theme, or `initialTheme`", () => {
    const one = moduleFor();
    one.StyleSheet.configure({ themes: { dark: themes.dark } });
    expect(one.UnistylesRuntime.themeName).toBe("dark");

    const two = moduleFor();
    two.StyleSheet.configure({ themes, settings: { initialTheme: "dark" } });
    expect(two.UnistylesRuntime.themeName).toBe("dark");
    expect(two.useUnistyles().theme).toBe(themes.dark);

    const fn = moduleFor();
    fn.StyleSheet.configure({ themes, settings: { initialTheme: () => "dark" } });
    expect(fn.UnistylesRuntime.themeName).toBe("dark");
  });

  it("falls back to the first theme when several exist and none is selected", () => {
    // The device throws on first use here; the official Jest mock returns the first
    // theme, and a suite that passes under Jest must still pass.
    const m = moduleFor();
    m.StyleSheet.configure({ themes });
    expect(m.UnistylesRuntime.themeName).toBeUndefined();
    expect(m.useUnistyles().theme).toBe(themes.light);
  });

  it("follows the colour scheme with adaptiveThemes", () => {
    const m = moduleFor();
    m.StyleSheet.configure({ themes, settings: { adaptiveThemes: true } });
    expect(m.UnistylesRuntime.hasAdaptiveThemes).toBe(true);
    expect(m.UnistylesRuntime.themeName).toBe("light");
  });

  it("throws the device runtime's configuration errors", () => {
    expect(() =>
      moduleFor().StyleSheet.configure({
        themes: { light: themes.light },
        settings: { adaptiveThemes: true },
      }),
    ).toThrow(
      "Unistyles: You're trying to enable adaptiveThemes, but you didn't register both 'light' and 'dark' themes.",
    );
    expect(() =>
      moduleFor().StyleSheet.configure({
        themes,
        settings: { adaptiveThemes: true, initialTheme: "dark" },
      }),
    ).toThrow("mutually exclusive");
    expect(() =>
      moduleFor().StyleSheet.configure({ themes, settings: { initialTheme: "sepia" } }),
    ).toThrow("Unistyles: You're trying to select theme 'sepia' but it wasn't registered.");
  });

  it("switches theme with setTheme, and the next read of a stylesheet shows it", () => {
    const m = moduleFor();
    m.StyleSheet.configure({ themes, settings: { initialTheme: "light" } });
    const styles = m.StyleSheet.create((theme: (typeof themes)["light"]) => ({
      root: { backgroundColor: theme.colors.background },
    }));
    expect(styles.root.backgroundColor).toBe("#fff");
    m.UnistylesRuntime.setTheme("dark");
    expect(styles.root.backgroundColor).toBe("#000");
    expect(m.UnistylesRuntime.setTheme).toHaveBeenCalledWith("dark");
    expect(() => m.UnistylesRuntime.setTheme("sepia")).toThrow(
      "Unistyles: You're trying to set theme to: 'sepia', but it wasn't registered.",
    );
  });

  it("refuses setTheme while adaptive themes are on, as the device does", () => {
    const m = moduleFor();
    m.StyleSheet.configure({ themes, settings: { adaptiveThemes: true } });
    expect(() => m.UnistylesRuntime.setTheme("dark")).toThrow(
      "Unistyles: You're trying to set theme to: 'dark', but adaptiveThemes are enabled.",
    );
    m.UnistylesRuntime.setAdaptiveThemes(false);
    m.UnistylesRuntime.setTheme("dark");
    expect(m.UnistylesRuntime.themeName).toBe("dark");
  });

  it("updates a theme in place", () => {
    const m = moduleFor();
    m.StyleSheet.configure({ themes, settings: { initialTheme: "light" } });
    m.UnistylesRuntime.updateTheme("light", (t: any) => ({
      ...t,
      colors: { ...t.colors, text: "red" },
    }));
    expect(m.useUnistyles().theme.colors.text).toBe("red");
  });
});

describe("unistyles preset: a stylesheet read before configure()", () => {
  it("names the missing StyleSheet.configure() rather than failing on the theme", () => {
    const m = moduleFor();
    expect(() =>
      m.StyleSheet.create((theme: any) => ({ root: { color: theme.colors.text } })),
    ).toThrow("Did you forget to call StyleSheet.configure?");
  });

  it("works as the official mock does when the stylesheet does not need a theme", () => {
    const m = moduleFor();
    const styles = m.StyleSheet.create((_theme: unknown, rt: any) => ({
      root: { width: rt.screen.width },
    }));
    expect(styles.root.width).toBe(m.UnistylesRuntime.screen.width);
  });
});

describe("unistyles preset: media queries", () => {
  function visible(element: React.ReactElement): boolean {
    const type = element.type as (props: any) => unknown;
    return type(element.props) !== null;
  }

  it("shows Display and hides Hide by the screen width, as useMedia does", () => {
    const m = moduleFor();
    m.StyleSheet.configure({ themes: { light: themes.light }, breakpoints });
    const width = m.UnistylesRuntime.screen.width;
    expect(width).toBeGreaterThan(0);
    const fits = m.mq.only.width(0, width);
    const tooNarrow = m.mq.only.width(width + 1);
    expect(visible(React.createElement(m.Display, { mq: fits }, "x"))).toBe(true);
    expect(visible(React.createElement(m.Display, { mq: tooNarrow }, "x"))).toBe(false);
    expect(visible(React.createElement(m.Hide, { mq: fits }, "x"))).toBe(false);
    expect(visible(React.createElement(m.Hide, { mq: tooNarrow }, "x"))).toBe(true);
  });

  it("renders ScopedTheme's children", () => {
    const m = moduleFor();
    expect(visible(React.createElement(m.ScopedTheme, { name: "dark" }, "x"))).toBe(true);
  });
});

describe("unistyles preset: source references", () => {
  it("ports from files the installed package still ships", () => {
    for (const file of [
      "src/web/variants.ts",
      "src/mq.ts",
      "src/utils.ts",
      "src/hooks/useMedia.native.ts",
      "cxx/hybridObjects/HybridStyleSheet.cpp",
      "lib/commonjs/mocks.js",
    ]) {
      expect(fs.existsSync(path.join(packageDir, file)), file).toBe(true);
    }
  });
});

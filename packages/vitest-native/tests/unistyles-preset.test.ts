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
import { act, render, screen } from "@testing-library/react-native";
import { Text } from "react-native";
import { describe, expect, it, vi } from "vitest";
import { resetAllMocks, setColorScheme } from "../src/helpers.js";
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
      // `_reset` is vitest-native's reset hook (resetAllMocks()), not an export.
      const built = Object.keys(mod.factory()).filter((key) => !key.startsWith("_"));
      expect(built.sort(), name).toEqual([...mod.exports].sort());
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
    expect(ours.UnistylesRuntime.getTheme()).toBe(official.useUnistyles().theme);

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

describe("unistyles preset: variants (cxx/parser/Parser.cpp)", () => {
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
    expect(two.UnistylesRuntime.getTheme()).toBe(themes.dark);

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
    expect(m.UnistylesRuntime.getTheme()).toBe(themes.light);
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
    expect(m.UnistylesRuntime.getTheme().colors.text).toBe("red");
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

describe("unistyles preset: styles as the device parses them (cxx/parser/Parser.cpp)", () => {
  // The mock engine's screen is 390 x 844, so `sm` (300) is the current breakpoint.
  function configured() {
    const m = moduleFor();
    m.StyleSheet.configure({ themes: { light: themes.light }, breakpoints });
    return m;
  }

  it("resolves breakpoint values, falling back to the nearest smaller breakpoint", () => {
    const m = configured();
    expect(m.UnistylesRuntime.breakpoint).toBe("sm");
    const styles = m.StyleSheet.create({
      box: { padding: { xs: 10, md: 20 }, margin: { xs: 1, sm: 2 }, width: { md: 5 } },
    });
    expect(styles.box).toEqual({ padding: 10, margin: 2, width: undefined });
  });

  it("prefers a matching mq key, which without an upper bound matches exactly", () => {
    const m = configured();
    const styles = m.StyleSheet.create({
      box: {
        width: { [m.mq.only.width(0, 400)]: 100, [m.mq.only.width(401)]: 200, sm: 1 },
        height: { ":w[390]": 7, xs: 3 },
        margin: { ":w[300]": 9, xs: 4 },
      },
    });
    expect(styles.box).toEqual({ width: 100, height: 7, margin: 4 });
  });

  it("uses orientation keys when no breakpoints are registered", () => {
    const m = moduleFor();
    m.StyleSheet.configure({ themes: { light: themes.light } });
    const styles = m.StyleSheet.create({ box: { flex: { portrait: 1, landscape: 2 } } });
    expect(styles.box).toEqual({ flex: 1 });
  });

  it("drops _web styles, functions and booleans, keeping includeFontPadding", () => {
    const styles = configured().StyleSheet.create({
      text: {
        color: "red",
        _web: { _hover: { opacity: 0.5 } },
        includeFontPadding: false,
        onPress: () => {},
        adjustsFontSizeToFit: true,
      },
    });
    expect(styles.text).toEqual({ color: "red", includeFontPadding: false });
  });

  it("resolves breakpoints inside transforms, shadow offsets and variants", () => {
    const m = configured();
    const styles = m.StyleSheet.create({
      box: {
        transform: [{ scale: { xs: 1, sm: 2 } }, { rotate: { md: "45deg" } }],
        shadowOffset: { width: { xs: 1, sm: 3 }, height: 2 },
        variants: { size: { big: { padding: { xs: 1, sm: 8 } } } },
      },
    });
    styles.useVariants({ size: "big" });
    expect(styles.box).toEqual({
      transform: [{ scale: 2 }],
      shadowOffset: { width: 3, height: 2 },
      padding: 8,
    });
  });

  it("keeps platform colours whole rather than reading them as breakpoints", () => {
    const color = { semantic: ["labelColor"] };
    const styles = configured().StyleSheet.create({ text: { color } });
    expect(styles.text.color).toBe(color);
  });

  it("returns the same style object until something it depends on changes", () => {
    const m = moduleFor();
    m.StyleSheet.configure({ themes, settings: { initialTheme: "light" } });
    const styles = m.StyleSheet.create((theme: any) => ({ root: { color: theme.colors.text } }));
    const first = styles.root;
    expect(styles.root).toBe(first);
    m.UnistylesRuntime.setTheme("dark");
    expect(styles.root).not.toBe(first);
    expect(styles.root).toEqual({ color: themes.dark.colors.text });
  });
});

describe("unistyles preset: variant selection by the device's rules", () => {
  const sheet = {
    button: {
      padding: 4,
      variants: { size: { small: { padding: 2 }, default: { padding: 6 } } },
      compoundVariants: [{ size: "default", styles: { borderWidth: 1 } }],
    },
  };

  it("applies nothing for a selected value with no option, not the default", () => {
    const styles = moduleFor().StyleSheet.create(sheet);
    styles.useVariants({ size: "huge" });
    expect(styles.button.padding).toBe(4);
  });

  it("matches compound variants against the defaults it applied", () => {
    const styles = moduleFor().StyleSheet.create(sheet);
    expect(styles.button).toEqual({ padding: 6, borderWidth: 1 });
    styles.useVariants({ size: undefined });
    expect(styles.button).toEqual({ padding: 6, borderWidth: 1 });
  });
});

describe("unistyles preset: configuration errors (HybridStyleSheet.cpp)", () => {
  const cases: [string, unknown, string][] = [
    [
      "an unexpected key",
      { breakPoints: {} },
      "StyleSheet.configure received unexpected key: 'breakPoints'.",
    ],
    [
      "an unexpected setting",
      { settings: { initalTheme: "light" } },
      "StyleSheet.configure's settings received unexpected key: 'initalTheme'",
    ],
    [
      "breakpoints not from 0",
      { breakpoints: { sm: 300 } },
      "StyleSheet.configure's first breakpoint must start from 0.",
    ],
    [
      "empty breakpoints",
      { breakpoints: {} },
      "StyleSheet.configure's breakpoints can't be empty.",
    ],
    [
      "a breakpoint that is not a number",
      { breakpoints: { xs: "0" } },
      "value for breakpoint xs is not a number.",
    ],
    [
      "a theme that is not an object",
      { themes: { light: 1 } },
      "StyleSheet.configure's registered theme 'light' must be an object.",
    ],
    [
      "a non-boolean adaptiveThemes",
      { settings: { adaptiveThemes: "yes" } },
      "StyleSheet.configure's adaptiveThemes must be of boolean type.",
    ],
    [
      "an initialTheme function that returns no string",
      { themes, settings: { initialTheme: () => 1 } },
      "StyleSheet.configure's initialTheme resolved from function is not a string. Please check your initialTheme function.",
    ],
    [
      "an unknown nativeBreakpointsMode",
      { settings: { nativeBreakpointsMode: "dp" } },
      "StyleSheet.configure's nativeBreakpointsMode must be one of: pixels or points",
    ],
  ];
  for (const [what, config, message] of cases) {
    it(`throws for ${what}`, () => {
      expect(() => moduleFor().StyleSheet.configure(config)).toThrow(message);
    });
  }
});

describe("unistyles preset: rendering", () => {
  function Probe({ m, testID }: { m: Record<string, any>; testID: string }) {
    const { theme } = m.useUnistyles();
    return React.createElement(Text, { testID }, theme.colors.text);
  }
  const text = (testID: string) => screen.getByTestId(testID).props.children;

  it("re-renders useUnistyles() on a theme change", async () => {
    const m = moduleFor();
    m.StyleSheet.configure({ themes, settings: { initialTheme: "light" } });
    await render(React.createElement(Probe, { m, testID: "probe" }));
    expect(text("probe")).toBe(themes.light.colors.text);
    await act(() => m.UnistylesRuntime.setTheme("dark"));
    expect(text("probe")).toBe(themes.dark.colors.text);
  });

  it("follows the colour scheme with adaptive themes, and re-renders", async () => {
    const m = moduleFor();
    m.StyleSheet.configure({ themes, settings: { adaptiveThemes: true } });
    await render(React.createElement(Probe, { m, testID: "probe" }));
    expect(m.UnistylesRuntime.themeName).toBe("light");
    try {
      await act(() => setColorScheme("dark"));
      expect(m.UnistylesRuntime.themeName).toBe("dark");
      expect(text("probe")).toBe(themes.dark.colors.text);
      m.UnistylesRuntime.setAdaptiveThemes(false);
      // Turning adaptive themes off keeps the theme they had chosen.
      expect(m.UnistylesRuntime.themeName).toBe("dark");
    } finally {
      setColorScheme("light");
    }
  });

  it("scopes a theme to ScopedTheme's children, by name, inverted or reset", async () => {
    const m = moduleFor();
    m.StyleSheet.configure({ themes, settings: { adaptiveThemes: true } });
    const styles = m.StyleSheet.create((theme: any) => ({ box: { color: theme.colors.text } }));
    function Box({ testID }: { testID: string }) {
      return React.createElement(Text, { testID, style: styles.box }, "x");
    }
    await render(
      React.createElement(
        React.Fragment,
        null,
        React.createElement(Box, { testID: "before" }),
        React.createElement(
          m.ScopedTheme,
          { name: "dark" },
          React.createElement(Box, { testID: "named" }),
          React.createElement(
            m.ScopedTheme,
            { reset: true },
            React.createElement(Box, { testID: "reset" }),
          ),
        ),
        React.createElement(
          m.ScopedTheme,
          { invertedAdaptive: true },
          React.createElement(Box, { testID: "inverted" }),
        ),
        React.createElement(Box, { testID: "after" }),
      ),
    );
    const color = (testID: string) => screen.getByTestId(testID).props.style.color;
    expect(color("before")).toBe(themes.light.colors.text);
    expect(color("named")).toBe(themes.dark.colors.text);
    expect(color("reset")).toBe(themes.light.colors.text);
    expect(color("inverted")).toBe(themes.dark.colors.text);
    expect(color("after")).toBe(themes.light.colors.text);
  });

  it("throws the device's error for a scoped theme that is not registered", async () => {
    const m = moduleFor();
    m.StyleSheet.configure({ themes, settings: { initialTheme: "light" } });
    const styles = m.StyleSheet.create((theme: any) => ({ box: { color: theme.colors.text } }));
    function Box() {
      return React.createElement(Text, { style: styles.box }, "x");
    }
    const spy = vi.spyOn(console, "error").mockImplementation(() => {});
    try {
      // RNTL 12 and 13 render synchronously and throw; RNTL 14's render rejects.
      await expect(async () =>
        render(React.createElement(m.ScopedTheme, { name: "sepia" }, React.createElement(Box))),
      ).rejects.toThrow(
        "Unistyles: You're trying to use scoped theme 'sepia' but it wasn't registered.",
      );
    } finally {
      spy.mockRestore();
    }
  });

  it("applies withUnistyles mappings and uniProps, deep-merged under the props", async () => {
    const m = moduleFor();
    m.StyleSheet.configure({ themes, settings: { initialTheme: "dark" } });
    let received: Record<string, any> = {};
    function Icon(props: Record<string, any>) {
      received = props;
      return null;
    }
    const Themed = m.withUnistyles(Icon, (theme: any) => ({
      color: theme.colors.text,
      extra: { a: 1 },
    }));
    await render(
      React.createElement(Themed, {
        uniProps: (theme: any) => ({ size: theme.gap(1), extra: { b: 2 } }),
        style: [{ margin: 1 }, [{ padding: 2 }]],
      }),
    );
    expect(received).toMatchObject({
      color: themes.dark.colors.text,
      size: themes.dark.gap(1),
      extra: { a: 1, b: 2 },
      style: { margin: 1, padding: 2 },
    });
  });

  it("shows Display and hides Hide by the screen width, as useMedia does", async () => {
    const m = moduleFor();
    m.StyleSheet.configure({ themes: { light: themes.light }, breakpoints });
    const width = m.UnistylesRuntime.screen.width;
    const fits = m.mq.only.width(0, width);
    const tooNarrow = m.mq.only.width(width + 1);
    const label = (id: string) => React.createElement(Text, { testID: id }, id);
    await render(
      React.createElement(
        React.Fragment,
        null,
        React.createElement(m.Display, { mq: fits }, label("display-fits")),
        React.createElement(m.Display, { mq: tooNarrow }, label("display-narrow")),
        React.createElement(m.Hide, { mq: fits }, label("hide-fits")),
        React.createElement(m.Hide, { mq: tooNarrow }, label("hide-narrow")),
      ),
    );
    expect(screen.queryByTestId("display-fits")).not.toBeNull();
    expect(screen.queryByTestId("display-narrow")).toBeNull();
    expect(screen.queryByTestId("hide-fits")).toBeNull();
    expect(screen.queryByTestId("hide-narrow")).not.toBeNull();
  });
});

describe("unistyles preset: between tests", () => {
  it("returns to what StyleSheet.configure() set when vitest-native resets its mocks", () => {
    const m = (globalThis as any).__vitest_native_preset_mocks[PACKAGE];
    m.StyleSheet.configure({ themes, settings: { initialTheme: "light" } });
    m.UnistylesRuntime.setTheme("dark");
    m.UnistylesRuntime.updateTheme("light", (t: any) => ({
      ...t,
      colors: { ...t.colors, text: "red" },
    }));
    resetAllMocks();
    expect(m.UnistylesRuntime.themeName).toBe("light");
    expect(m.UnistylesRuntime.getTheme("light")).toBe(themes.light);
  });
});

describe("unistyles preset: source references", () => {
  it("ports from files the installed package still ships", () => {
    for (const file of [
      "src/web/variants.ts",
      "src/mq.ts",
      "src/utils.ts",
      "src/hooks/useMedia.native.ts",
      "src/components/ScopedTheme.tsx",
      "src/components/NamedTheme.tsx",
      "src/components/AdaptiveTheme.tsx",
      "src/core/withUnistyles/withUnistyles.native.tsx",
      "cxx/parser/Parser.cpp",
      "cxx/core/MediaQueries.cpp",
      "cxx/common/Helpers.h",
      "cxx/hybridObjects/HybridStyleSheet.cpp",
      "cxx/hybridObjects/HybridUnistylesRuntime.cpp",
      "lib/commonjs/mocks.js",
    ]) {
      expect(fs.existsSync(path.join(packageDir, file)), file).toBe(true);
    }
  });
});

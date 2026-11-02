/**
 * The screens preset has to cover what native-stack actually reaches for.
 *
 * Reported from a migration: a real native-stack never reached `onReady`, so the
 * screen stayed empty with nothing thrown, until the project shipped its own
 * ~160-line mock. `ScreenStackItem` is the one that matters most — native-stack
 * renders through it — and it was absent.
 *
 * The list here was taken from react-native-screens 4.26.2's published type
 * surface rather than from the names someone noticed missing. That distinction is
 * the point: the report named six, and checking the package found sixteen.
 *
 * Seventeen, in the end. The first pass read the .d.ts with a regex and missed
 * `Tabs`; resolving the module through the TypeScript checker found it, along with
 * the 76 type-only exports a regex would have counted as missing surface.
 *
 * Two of the reported names, RNSScreensRefContext and GHContext, are NOT top-level
 * exports — they live in the package's `contexts` module, reached by deep import.
 * They are deliberately not claimed here; see the note at the end of this file.
 */
import React from "react";
import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react-native";
import { screens } from "../src/presets/screens.js";

/** Every name react-native-screens 4.26.2 exports from its entry point. */
const REAL_SURFACE = [
  "FullWindowOverlay",
  "InnerScreen",
  "Screen",
  "ScreenContainer",
  "ScreenContentWrapper",
  "ScreenContext",
  "ScreenFooter",
  "ScreenStack",
  "ScreenStackHeaderBackButtonImage",
  "ScreenStackHeaderCenterView",
  "ScreenStackHeaderConfig",
  "ScreenStackHeaderLeftView",
  "ScreenStackHeaderRightView",
  "ScreenStackHeaderSearchBarView",
  "ScreenStackHeaderSubview",
  "ScreenStackItem",
  "SearchBar",
  "Tabs",
  "compatibilityFlags",
  "enableFreeze",
  "enableScreens",
  "executeNativeBackPress",
  "featureFlags",
  "freezeEnabled",
  "isSearchBarAvailableForCurrentPlatform",
  "screensEnabled",
  "useTransitionProgress",
];

const preset = screens();
const module = preset.modules["react-native-screens"];

describe("screens preset surface", () => {
  it("declares every export the real package has", () => {
    const missing = REAL_SURFACE.filter((name) => !module.exports.includes(name));
    expect(
      missing,
      `declared by react-native-screens but not by the preset:\n${missing.join("\n")}`,
    ).toEqual([]);
  });

  it("builds every name it declares", () => {
    // A name in `exports` that the factory does not produce is an undefined import
    // at the call site — worse than omitting it, because it looks supported.
    const built = module.factory();
    const hollow = module.exports.filter((name) => !(name in built));
    expect(hollow, `declared but not built:\n${hollow.join("\n")}`).toEqual([]);
  });

  it("provides ScreenStackItem, which native-stack renders through", () => {
    expect(module.factory().ScreenStackItem).toBeTruthy();
  });

  it("renders headerConfig's children, where native-stack puts headerLeft and headerRight", async () => {
    // @react-navigation/native-stack 7.x passes the header's elements to
    // ScreenStackItem as `headerConfig.children`; the real component renders
    // `<ScreenStackHeaderConfig {...headerConfig} />` after the content.
    const built = module.factory() as Record<string, React.ComponentType<any>>;
    const { ScreenStackItem, ScreenStackHeaderRightView } = built;
    await render(
      React.createElement(
        ScreenStackItem,
        {
          screenId: "home",
          testID: "item",
          headerConfig: {
            title: "Home",
            hidden: true,
            children: React.createElement(
              ScreenStackHeaderRightView,
              null,
              React.createElement("View", { testID: "header-right-button" }),
            ),
          },
        },
        React.createElement("View", { testID: "content" }),
      ),
    );

    expect(screen.getByTestId("header-right-button")).toBeTruthy();
    expect(screen.getByTestId("content")).toBeTruthy();

    // Read the host tree: RNTL 12 and 13 return composite instances from queries,
    // whose children are elements, where RNTL 14 returns host nodes.
    type HostNode = { type: string; props: Record<string, unknown>; children?: unknown[] };
    const findHost = (node: unknown, testID: string): HostNode | undefined => {
      if (!node || typeof node !== "object") return undefined;
      const host = node as HostNode;
      if (host.props?.testID === testID) return host;
      for (const child of host.children ?? []) {
        const found = findHost(child, testID);
        if (found) return found;
      }
      return undefined;
    };
    const item = findHost(screen.toJSON(), "item");
    // The header follows the content, as in the real component, and carries the
    // config as its own props; the item does not.
    expect(item?.props.headerConfig).toBeUndefined();
    expect(item?.props.screenId).toBe("home");
    const header = item?.children?.[1] as HostNode;
    expect(header.type).toBe("ScreenStackHeaderConfig");
    expect(header.props).toMatchObject({ title: "Home", hidden: true });
  });

  it("makes ScreenContext a real context, not a component stub", () => {
    // native-stack calls useContext on it; a forwardRef component would throw.
    const context = module.factory().ScreenContext as { Provider?: unknown; Consumer?: unknown };
    expect(context.Provider).toBeTruthy();
    expect(context.Consumer).toBeTruthy();
  });

  it("returns a transition-progress shape rather than a bare mock", () => {
    const progress = (module.factory().useTransitionProgress as () => unknown)();
    expect(progress).toMatchObject({ progress: expect.any(Number) });
  });

  it("keeps the v3 names a project on the older major still imports", () => {
    expect(module.exports).toContain("NativeScreen");
    expect(module.exports).toContain("NativeScreenContainer");
  });
});

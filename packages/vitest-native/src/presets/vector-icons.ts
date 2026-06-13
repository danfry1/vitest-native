import type { Preset } from "../types.js";
import React from "react";

// @react-native-vector-icons v10+ split each icon set into its own package
// (`@react-native-vector-icons/material-icons`, …), all built on a single shared
// factory in `@react-native-vector-icons/common`. That common module's dynamic
// font loader runs at import time and queries the native ExpoFontLoader, which
// can't exist in Node — so importing any icon set throws and the set is wrongly
// reported "not available". Shadowing the ONE common module (the way jest mocks
// vector-icons) fixes every set at once: `createIconSet(...)` returns a simple
// Text-based stub that forwards name/size/color/style/testID, so icons render and
// are queryable without running the native font machinery.
const DEFAULT_ICON_SIZE = 12;
const DEFAULT_ICON_COLOR = "black";

export function vectorIcons(): Preset {
  return {
    name: "vectorIcons",
    modules: {
      "@react-native-vector-icons/common": {
        exports: [
          "createIconSet",
          "DEFAULT_ICON_COLOR",
          "DEFAULT_ICON_SIZE",
          "isDynamicLoadingEnabled",
          "isDynamicLoadingSupported",
          "setDynamicLoadingEnabled",
          "setDynamicLoadingErrorCallback",
        ],
        factory: () => {
          const createIconSet = (_glyphMap?: any, _options?: any) => {
            const Icon = React.forwardRef((props: any, ref: any) => {
              const {
                size = DEFAULT_ICON_SIZE,
                color = DEFAULT_ICON_COLOR,
                style,
                children,
                ...rest
              } = props;
              return React.createElement(
                "Text",
                { ref, selectable: false, ...rest, style: [{ fontSize: size, color }, style] },
                children,
              );
            });
            Icon.displayName = "Icon";
            // Static helpers some consumers reach for; safe no-ops here.
            (Icon as any).getImageSource = async () => null;
            (Icon as any).getImageSourceSync = () => null;
            (Icon as any).getFontFamily = () => "";
            (Icon as any).hasIcon = () => false;
            (Icon as any).getRawGlyphMap = () => ({});
            (Icon as any).loadFont = async () => {};
            return Icon;
          };
          const noop = () => {};
          return {
            createIconSet,
            DEFAULT_ICON_COLOR,
            DEFAULT_ICON_SIZE,
            isDynamicLoadingEnabled: () => false,
            isDynamicLoadingSupported: () => false,
            setDynamicLoadingEnabled: noop,
            setDynamicLoadingErrorCallback: noop,
            default: { createIconSet, DEFAULT_ICON_COLOR, DEFAULT_ICON_SIZE },
          };
        },
      },
    },
  };
}

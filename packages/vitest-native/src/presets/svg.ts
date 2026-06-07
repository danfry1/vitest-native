import type { Preset } from "../types.js";
import React from "react";

// react-native-svg renders native SVG host components. Shadow each element with a
// host component that passes children through, so SVG-based UIs render in tests.
const SVG_COMPONENTS = [
  "Svg",
  "Circle",
  "Ellipse",
  "G",
  "Text",
  "TSpan",
  "TextPath",
  "Path",
  "Polygon",
  "Polyline",
  "Line",
  "Rect",
  "Use",
  "Image",
  "Symbol",
  "Defs",
  "LinearGradient",
  "RadialGradient",
  "Stop",
  "ClipPath",
  "Pattern",
  "Mask",
  "Marker",
  "ForeignObject",
  "FeBlend",
  "FeColorMatrix",
  "FeGaussianBlur",
  "FeMerge",
  "FeOffset",
];

export function svg(): Preset {
  return {
    name: "svg",
    modules: {
      "react-native-svg": {
        exports: [...SVG_COMPONENTS, "SvgXml", "SvgUri", "SvgCss", "SvgCssUri"],
        factory: () => {
          const make = (name: string) => {
            const C = React.forwardRef((props: any, ref: any) =>
              React.createElement(name, { ...props, ref }, props.children),
            );
            C.displayName = name;
            return C;
          };
          const out: Record<string, any> = { __esModule: true };
          for (const name of SVG_COMPONENTS) out[name] = make(name);
          // String/URI helpers render an <Svg> host.
          out.SvgXml = make("SvgXml");
          out.SvgUri = make("SvgUri");
          out.SvgCss = make("SvgCss");
          out.SvgCssUri = make("SvgCssUri");
          out.default = out.Svg;
          return out;
        },
      },
    },
  };
}

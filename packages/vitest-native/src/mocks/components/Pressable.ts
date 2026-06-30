import React from "react";
import { buildPressableHostProps } from "./pressableHost.js";

// Unlike the Touchable* family, Pressable resolves `style` and `children` as
// functions of its interaction state — `style={({pressed}) => ...}` and
// `children={({pressed}) => ...}`. Real RN tracks `pressed` (true between press-in
// and press-out) and re-renders, so the mock does the same: resolve both against
// the live pressed state, and toggle it through the press-in/out handlers the host
// already wires up. At rest `pressed` is false, matching real RN's initial render.
export function createPressableMock() {
  const Pressable = React.forwardRef((props: any, ref: any) => {
    const { style, children, onPressIn, onPressOut, ...rest } = props;
    const [pressed, setPressed] = React.useState(false);
    const state = { pressed };
    const resolvedStyle = typeof style === "function" ? style(state) : style;
    const resolvedChildren = typeof children === "function" ? children(state) : children;
    const hostProps = buildPressableHostProps(
      {
        ...rest,
        style: resolvedStyle,
        onPressIn: (e: any) => {
          setPressed(true);
          onPressIn?.(e);
        },
        onPressOut: (e: any) => {
          setPressed(false);
          onPressOut?.(e);
        },
      },
      ref,
    );
    return React.createElement("Pressable", hostProps, resolvedChildren);
  });
  Pressable.displayName = "Pressable";
  return Pressable;
}

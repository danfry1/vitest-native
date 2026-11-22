/**
 * A React Native tree prints as Jest and Vitest print React trees: pretty-format's
 * ReactTestComponent plugin, which Vitest registers. vitest-native registers no serializer
 * of its own, so a Jest-written snapshot of the same tree passes unchanged. The tree is
 * React Native's own: host names such as RCTView, with the props React Native's
 * components pass to them.
 *
 * And no host carries `ref`: React 19 passes `ref` as a prop to a string host, so a host
 * component that reached React as a bare name (Text's RCTText, from
 * createReactNativeComponentClass) printed it, and its ref had none of the native methods
 * a View ref has.
 */
import React from "react";
import { Text, View } from "react-native";
import { render } from "@testing-library/react-native";
import { expect, it } from "vitest";

type JsonNode = { type: string; props: Record<string, unknown>; children: JsonNode[] | null };

function hosts(node: JsonNode | string | null, out: JsonNode[] = []): JsonNode[] {
  if (node && typeof node === "object") {
    out.push(node);
    for (const child of node.children ?? []) hosts(child, out);
  }
  return out;
}

it("prints a tree in pretty-format's React format, with React Native's host names", async () => {
  const { toJSON } = await render(
    <View testID="box" style={[{ flex: 1 }, undefined]}>
      <Text>hello</Text>
    </View>,
  );
  expect(toJSON()).toMatchInlineSnapshot(`
    <RCTView
      style={
        [
          {
            "flex": 1,
          },
          undefined,
        ]
      }
      testID="box"
    >
      <RCTText
        accessible={true}
        allowFontScaling={true}
        ellipsizeMode="tail"
        style={
          [
            {
              "overflow": "hidden",
            },
            undefined,
          ]
        }
      >
        hello
      </RCTText>
    </RCTView>
  `);
});

it("puts no ref among a host's props, and a Text ref has the native methods a View ref has", async () => {
  const viewRef = React.createRef<View>();
  const textRef = React.createRef<Text>();
  const { toJSON } = await render(
    <View ref={viewRef}>
      <Text ref={textRef}>
        outer <Text>nested</Text>
      </Text>
    </View>,
  );
  for (const node of hosts(toJSON() as JsonNode)) {
    expect(Object.keys(node.props), node.type).not.toContain("ref");
  }
  for (const ref of [viewRef.current, textRef.current]) {
    for (const method of ["measure", "measureInWindow", "measureLayout", "focus", "blur"]) {
      expect(typeof (ref as unknown as Record<string, unknown>)[method], method).toBe("function");
    }
  }
});

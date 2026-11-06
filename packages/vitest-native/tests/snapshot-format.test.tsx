/**
 * Under the mock engine too, a React tree prints with pretty-format's ReactTestComponent
 * plugin, as Jest and Vitest print React trees: vitest-native registers no serializer of
 * its own (tests-native/snapshot-format.test.tsx is the native engine's counterpart).
 *
 * No host carries `ref`: the mock components render their hosts through one class per
 * host name (src/mocks/host.ts), so React attaches a ref to that instance, which has the
 * native methods, instead of passing it to the host as a prop.
 */
import React from "react";
import { Text, View } from "react-native";
import { render } from "@testing-library/react-native";
import { expect, it } from "vitest";

it("prints a tree in pretty-format's React format", async () => {
  const { toJSON } = await render(
    <View testID="box" style={[{ flex: 1 }, undefined]}>
      <Text>hello</Text>
    </View>,
  );
  expect(toJSON()).toMatchInlineSnapshot(`
    <View
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
      <Text
        accessible={true}
      >
        hello
      </Text>
    </View>
  `);
});

type JsonNode = { type: string; props: Record<string, unknown>; children: JsonNode[] | null };

function hosts(node: JsonNode | string | null, out: JsonNode[] = []): JsonNode[] {
  if (node && typeof node === "object") {
    out.push(node);
    for (const child of node.children ?? []) hosts(child, out);
  }
  return out;
}

it("puts no ref among a host's props, and host refs have the native methods", async () => {
  const viewRef = React.createRef<View>();
  const textRef = React.createRef<Text>();
  const { toJSON } = await render(
    <View ref={viewRef}>
      <Text ref={textRef}>hello</Text>
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

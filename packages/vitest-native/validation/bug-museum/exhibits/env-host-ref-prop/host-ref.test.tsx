import React from "react";
import { Text, View } from "react-native";
import { render } from "@testing-library/react-native";

type Node = { type: string; props: Record<string, unknown>; children: (Node | string)[] | null };

function hostsWithRef(node: Node | string | null, out: string[] = []): string[] {
  if (!node || typeof node === "string") return out;
  if (Object.prototype.hasOwnProperty.call(node.props, "ref")) out.push(node.type);
  for (const child of node.children ?? []) hostsWithRef(child, out);
  return out;
}

test("a screen's toJSON(), as a snapshot prints it, carries no ref", async () => {
  const label = React.createRef<Text>();
  const { toJSON } = await render(
    <View testID="screen">
      <Text ref={label}>Title</Text>
      <Text>Body</Text>
    </View>,
  );
  expect(hostsWithRef(toJSON() as Node), "hosts that carry a ref prop").toEqual([]);
  expect(typeof (label.current as unknown as { measure?: unknown })?.measure, "a Text ref's measure").toBe(
    "function",
  );
});

/**
 * Behavioral fidelity tests for the NATIVE engine.
 *
 * These assert the *device-accurate* behavior of real React Native. The companion
 * file `tests/fidelity-divergence.test.tsx` runs the SAME scenarios under the MOCK
 * engine and documents where the mock diverges (and would give a false pass). Keep
 * the two files in sync — they are the evidence for why `engine: 'native'` exists.
 */
import { describe, it, expect } from "vitest";
import React from "react";
import { render, screen } from "@testing-library/react-native";
import TestRenderer, { act } from "react-test-renderer";
import { FlatList, Text } from "react-native";

const h = React.createElement;

describe("native fidelity: FlatList virtualization (real windowing)", () => {
  async function renderList(n: number) {
    return await render(
      h(FlatList, {
        data: Array.from({ length: n }, (_, i) => i),
        keyExtractor: (i: any) => String(i),
        renderItem: ({ item }: any) => h(Text, null, `item-${item}`),
      }) as any,
    );
  }

  it("renders only the initial window (~10), NOT the whole list", async () => {
    await renderList(100);
    let rendered = 0;
    for (let i = 0; i < 100; i++) if (screen.queryByText(`item-${i}`)) rendered++;
    // Real RN mounts initialNumToRender (default 10) without layout/scroll metrics.
    expect(rendered).toBeLessThan(100);
    expect(rendered).toBeLessThanOrEqual(15);
    expect(screen.getByText("item-0")).toBeTruthy();
  });

  it("does NOT render an item far past the window (device-accurate)", async () => {
    await renderList(100);
    // On a device, item-99 is not mounted until scrolled to. Real RN reflects this.
    expect(screen.queryByText("item-99")).toBeNull();
  });
});

describe("native fidelity: real host-component tree", () => {
  it("Text renders as RCTText with real RN-computed props", async () => {
    let tree: any;
    await act(() => {
      tree = TestRenderer.create(h(Text, null, "hi"));
    });
    const json = tree.toJSON();
    expect(json.type).toBe("RCTText");
    expect(json.props.allowFontScaling).toBe(true); // computed by real Text.js
  });
});

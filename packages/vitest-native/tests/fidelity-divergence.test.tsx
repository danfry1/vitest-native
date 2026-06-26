/**
 * Mock-engine divergence tests — the OTHER half of the differential pair with
 * `tests-native/fidelity.test.tsx`.
 *
 * These run under the default (mock) engine and assert the mock's ACTUAL behavior,
 * which diverges from real React Native. Each `it` documents a place where a test
 * written against the mock would give a FALSE PASS relative to a real device — i.e.
 * the concrete reason to reach for `engine: 'native'` when fidelity matters.
 *
 * If one of these starts failing because the mock was improved to match real RN,
 * that's good — update it (and the native counterpart) to reflect the new parity.
 */
import { describe, it, expect } from "vitest";
import React from "react";
import { render, screen } from "@testing-library/react-native";
import { FlatList, Text } from "react-native";

const h = React.createElement;

describe("mock divergence: FlatList does NOT virtualize", () => {
  async function renderList(n: number) {
    return await render(
      h(FlatList, {
        data: Array.from({ length: n }, (_, i) => i),
        keyExtractor: (i: any) => String(i),
        renderItem: ({ item }: any) => h(Text, null, `item-${item}`),
      }) as any,
    );
  }

  it("renders the ENTIRE list (real RN renders ~10) — FALSE-PASS risk", async () => {
    await renderList(100);
    let rendered = 0;
    for (let i = 0; i < 100; i++) if (screen.queryByText(`item-${i}`)) rendered++;
    // The mock has no virtualization: all 100 mount. Real RN mounts ~10.
    expect(rendered).toBe(100);
  });

  it("finds an item far past the window that a device never mounts — FALSE PASS", async () => {
    await renderList(100);
    // Under mock this passes; on a device (and under engine:'native') item-99 is absent.
    expect(screen.getByText("item-99")).toBeTruthy();
  });
});

describe("mock divergence: simplified host tree", () => {
  it("Text renders as a bare 'Text' host (real RN: 'RCTText')", async () => {
    await render(h(Text, null, "hi") as any);
    const host = screen.getByText("hi");
    // Mock uses the JS component name; real RN uses the native view name RCTText.
    expect(host.type).toBe("Text");
  });
});

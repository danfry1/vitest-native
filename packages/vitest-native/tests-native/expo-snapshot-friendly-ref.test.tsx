/**
 * expo-image's `Image` makes `nativeViewRef` and `containerViewRef` with expo-modules-core's
 * `createSnapshotFriendlyRef()`, attaches them to its native views and passes them to the
 * native view as props too. That function is React's `createRef`, so a snapshot printed the
 * host instance behind the ref and React's fiber tree with it: thousands of lines, with render
 * timings that changed on every run. jest-expo serves a ref that prints as "[React.ref]", and
 * so does the engine (boundary.mjs).
 */
import { createRequire } from "node:module";
import React from "react";
import { View } from "react-native";
import { render, screen } from "@testing-library/react-native";
import { expect, it } from "vitest";

// expo-modules-core as Expo's packages reach it (it is not a dependency of this package).
const fromExpo = createRequire(require.resolve("expo/package.json"));
const sources = [
  ["expo-modules-core", fromExpo("expo-modules-core").createSnapshotFriendlyRef],
  ["expo", (await import("expo")).createSnapshotFriendlyRef],
] as const;

for (const [name, createSnapshotFriendlyRef] of sources) {
  /** expo-image's Image, cut down to its refs: each attached and passed as a prop. */
  function RefsAsProps() {
    const nativeViewRef = React.useMemo(() => createSnapshotFriendlyRef(), []);
    const containerViewRef = React.useMemo(() => createSnapshotFriendlyRef(), []);
    return (
      <View ref={containerViewRef} testID="container">
        <View ref={nativeViewRef} testID="native" {...{ nativeViewRef, containerViewRef }} />
      </View>
    );
  }

  it(`a ref from ${name}'s createSnapshotFriendlyRef prints as jest-expo's does`, async () => {
    await render(<RefsAsProps />);
    expect(screen.toJSON()).toMatchInlineSnapshot(`
      <RCTView
        testID="container"
      >
        <RCTView
          containerViewRef={"[React.ref]"}
          nativeViewRef={"[React.ref]"}
          testID="native"
        />
      </RCTView>
    `);
  });

  it(`a snapshot through ${name}'s refs is the same on every render`, async () => {
    const first = await render(<RefsAsProps />);
    const once = JSON.stringify(first.toJSON());
    await first.unmount();
    const second = await render(<RefsAsProps />);
    expect(JSON.stringify(second.toJSON())).toBe(once);
  });

  it(`a ref from ${name} still holds the view it is attached to`, async () => {
    const ref = createSnapshotFriendlyRef();
    await render(<View ref={ref} testID="held" />);
    expect(ref.current).not.toBeNull();
    expect(Object.keys(ref)).toEqual(["current"]);
    expect(JSON.stringify({ ref })).toBe('{"ref":"[React.ref]"}');
  });
}

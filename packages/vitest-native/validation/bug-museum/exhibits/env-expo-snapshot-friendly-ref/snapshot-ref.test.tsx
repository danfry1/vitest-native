// expo-image's Image, cut down to one ref: made with createSnapshotFriendlyRef, attached to
// the native view and passed to it as a prop.
import React from "react";
import { View } from "react-native";
import { render } from "@testing-library/react-native";
import { createSnapshotFriendlyRef } from "expo-modules-core";
import { expect, test } from "vitest";

function Image() {
  const nativeViewRef = React.useMemo(() => createSnapshotFriendlyRef(), []);
  return <View ref={nativeViewRef} testID="image" {...{ nativeViewRef }} />;
}

test("a snapshot prints the ref as jest-expo does", async () => {
  const screen = await render(<Image />);
  expect(screen.toJSON()).toMatchInlineSnapshot(`
    <RCTView
      nativeViewRef={"[React.ref]"}
      testID="image"
    />
  `);
});

/**
 * expo-image's own `Image` (#849), where tests-native/expo-snapshot-friendly-ref.test.tsx
 * cuts it down to its refs. The `Image` makes `nativeViewRef` and `containerViewRef` with
 * expo-modules-core's `createSnapshotFriendlyRef()` and passes both to its native view as
 * props, so a snapshot of it printed what each ref held. The engine serves jest-expo's ref,
 * which prints as "[React.ref]" (boundary.mjs).
 */
import React from "react";
import { render, screen } from "@testing-library/react-native";
import { Image } from "expo-image";
import { expect, it } from "vitest";

const image = () => <Image source={{ uri: "https://example.com/a.png" }} testID="image" />;

it("a snapshot of expo-image's Image prints its refs as jest-expo's do", async () => {
  await render(image());
  expect(screen.toJSON()).toMatchInlineSnapshot(`
    <ViewManagerAdapter_ExpoImage
      containerViewRef={"[React.ref]"}
      contentFit="cover"
      contentPosition={
        {
          "left": "50%",
          "top": "50%",
        }
      }
      nativeViewRef={"[React.ref]"}
      onError={[Function]}
      onLoad={[Function]}
      onLoadStart={[Function]}
      onProgress={[Function]}
      placeholder={[]}
      sfEffect={null}
      source={
        [
          {
            "uri": "https://example.com/a.png",
          },
        ]
      }
      style={{}}
      symbolSize={null}
      symbolWeight={null}
      testID="image"
      transition={null}
    />
  `);
});

it("a snapshot of expo-image's Image is the same on every render", async () => {
  const first = await render(image());
  const once = JSON.stringify(first.toJSON());
  await first.unmount();
  const second = await render(image());
  expect(JSON.stringify(second.toJSON())).toBe(once);
});

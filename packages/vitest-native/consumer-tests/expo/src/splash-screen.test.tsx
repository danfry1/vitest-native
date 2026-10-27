/**
 * Expo's documented splash-screen flow (#319). The expo preset used to replace
 * expo-splash-screen with a stand-in that had only preventAutoHideAsync and hideAsync,
 * so `import { hide } from 'expo-splash-screen'`, Expo's API since SDK 52, was
 * undefined. Under the native engine the package runs as itself, so its whole API is
 * there, current with the installed SDK.
 */
import { render } from "@testing-library/react-native";
import { hide, preventAutoHideAsync, setOptions } from "expo-splash-screen";
import { useEffect, useState } from "react";
import { expect, it } from "vitest";

void preventAutoHideAsync();

function RootLayout() {
  const [ready, setReady] = useState(false);
  useEffect(() => setReady(true), []);
  useEffect(() => {
    if (ready) hide();
  }, [ready]);
  return null;
}

it("renders a root layout that hides the splash screen", async () => {
  setOptions({ duration: 400, fade: true });
  await expect(render(<RootLayout />)).resolves.toBeTruthy();
  expect(typeof hide).toBe("function");
});

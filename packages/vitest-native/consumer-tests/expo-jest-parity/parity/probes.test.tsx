/**
 * The same probes, run under jest-expo and under vitest-native (parity/run.mjs), each
 * recording a value or an error. run.mjs requires the two records to agree except for
 * the differences listed there with a reason. Written once for both runners: globals
 * only (test, afterAll), static imports, no runner API.
 */
import fs from "node:fs";
import React from "react";
// Not probed: Image.getSize, whose jest-expo mock calls back with the wrong arguments
// from process.nextTick, which fails the Jest run itself.
import { LogBox, Text } from "react-native";
import { render } from "@testing-library/react-native";
import * as Application from "expo-application";
import { Asset } from "expo-asset";
import * as Clipboard from "expo-clipboard";
import Constants from "expo-constants";
import * as Crypto from "expo-crypto";
import * as Device from "expo-device";
import * as FS from "expo-file-system";
import * as FSLegacy from "expo-file-system/legacy";
import * as Font from "expo-font";
import * as Haptics from "expo-haptics";
import { Image as ExpoImage } from "expo-image";
import * as ImagePicker from "expo-image-picker";
import { requireOptionalNativeModule } from "expo";
import * as Linking from "expo-linking";
import * as Localization from "expo-localization";
import * as Network from "expo-network";
import * as SecureStore from "expo-secure-store";
import * as Splash from "expo-splash-screen";
import * as StatusBar from "expo-status-bar";
import * as WebBrowser from "expo-web-browser";
import icon from "../src/icon.png";

const results: Record<string, unknown> = {};

function normalize(value: unknown, depth = 0): unknown {
  if (typeof value === "function") return "[function]";
  if (value === undefined) return "[undefined]";
  if (value instanceof Uint8Array) return `[Uint8Array ${value.length}]`;
  if (Array.isArray(value)) {
    return depth > 2 ? "[array]" : value.slice(0, 5).map((item) => normalize(item, depth + 1));
  }
  if (value && typeof value === "object") {
    if (depth > 2) return "[object]";
    const out: Record<string, unknown> = {};
    for (const key of Object.keys(value).sort().slice(0, 30)) {
      out[key] = normalize((value as Record<string, unknown>)[key], depth + 1);
    }
    return out;
  }
  return value;
}

async function probe(name: string, read: () => unknown) {
  try {
    results[name] = { value: normalize(await read()) };
  } catch (error) {
    results[name] = {
      error: String((error as Error)?.message ?? error)
        .split("\n")[0]
        .slice(0, 160),
    };
  }
}

const exportsOf = (module: object) =>
  Object.keys(module)
    .filter((key) => key !== "__esModule")
    .sort();

afterAll(() =>
  fs.writeFileSync(
    process.env.PARITY_OUT as string,
    JSON.stringify(
      {
        // Which engine answered: run.mjs requires vitest-native's real React Native one.
        engine: (globalThis as any).__vitest_native_control?.engine ?? "jest",
        results,
      },
      null,
      1,
    ),
  ),
);

test("Expo's runtime globals", async () => {
  await probe("typeof window", () => typeof (globalThis as any).window);
  await probe("navigator", () => (globalThis as any).navigator);
  await probe("devtools hook", () => typeof (globalThis as any).__REACT_DEVTOOLS_GLOBAL_HOOK__);
  await probe("ReadableStream", () => typeof (globalThis as any).ReadableStream);
  await probe("TextDecoderStream", () => typeof (globalThis as any).TextDecoderStream);
  await probe("LogBox.ignoreLogs", () => LogBox.ignoreLogs(["x"]));
});

test("the packages the expo preset used to replace", async () => {
  for (const [name, module] of Object.entries({
    Constants: { default: Constants },
    Font,
    Asset: { Asset },
    Splash,
    Linking,
    StatusBar,
  })) {
    if (name !== "Constants" && name !== "Asset")
      await probe(`${name} exports`, () => exportsOf(module));
  }
  await probe("Constants.expoConfig", () => Constants.expoConfig);
  await probe("Constants.appOwnership", () => Constants.appOwnership);
  await probe("Constants.executionEnvironment", () => Constants.executionEnvironment);
  await probe("Constants.statusBarHeight", () => Constants.statusBarHeight);
  await probe("Constants.getWebViewUserAgentAsync()", () => Constants.getWebViewUserAgentAsync());
  await probe("Linking.createURL", () => Linking.createURL("p"));
  await probe("Linking.parse", () => Linking.parse("myapp://a?x=1"));
  await probe("Linking.getInitialURL", () => Linking.getInitialURL());
  await probe("Font.isLoaded", () => Font.isLoaded("x"));
  await probe("Font.loadAsync of a number", () => Font.loadAsync({ x: 1 as any }));
  await probe("Asset.fromModule of a number", () => Asset.fromModule(1).name);
  await probe("Asset.fromModule of a bundled image", () => Asset.fromModule(icon).type);
  await probe("Splash.preventAutoHideAsync", () => Splash.preventAutoHideAsync());
  await probe("Splash.hide", () => Splash.hide());
  await probe("Splash.setOptions", () => Splash.setOptions({ fade: true }));
});

test("Expo modules' native modules", async () => {
  await probe("Crypto.digestStringAsync", () =>
    Crypto.digestStringAsync(Crypto.CryptoDigestAlgorithm.SHA256, "x"),
  );
  await probe("Crypto.randomUUID", () => typeof Crypto.randomUUID());
  await probe("Crypto.getRandomBytes", () => Crypto.getRandomBytes(4));
  await probe("Haptics.impactAsync", () => Haptics.impactAsync());
  await probe("Clipboard set and get", async () => {
    await Clipboard.setStringAsync("hi");
    return Clipboard.getStringAsync();
  });
  await probe("SecureStore set and get", async () => {
    await SecureStore.setItemAsync("k", "v");
    return SecureStore.getItemAsync("k");
  });
  await probe("FileSystem legacy getInfoAsync", () => FSLegacy.getInfoAsync("file:///a"));
  await probe("FileSystem legacy documentDirectory", () => FSLegacy.documentDirectory);
  await probe("FileSystem Paths.document", () => typeof FS.Paths?.document);
  await probe("Device.modelName", () => Device.modelName);
  await probe("Device.isDevice", () => Device.isDevice);
  await probe("Device.deviceYearClass", () => Device.deviceYearClass);
  await probe("Localization.getLocales", () => Localization.getLocales());
  await probe("Application.applicationId", () => Application.applicationId);
  await probe("Network.getNetworkStateAsync", () => Network.getNetworkStateAsync());
  await probe("WebBrowser.openBrowserAsync", () =>
    WebBrowser.openBrowserAsync("https://example.com"),
  );
  await probe("ImagePicker.requestMediaLibraryPermissionsAsync", () =>
    ImagePicker.requestMediaLibraryPermissionsAsync(),
  );
  // expo-image probes for expo-observe's module, which this app does not install.
  await probe("optional module nothing installed defines", () =>
    requireOptionalNativeModule("ExpoObserve"),
  );
});

test("rendering", async () => {
  await probe("expo-image host", async () => {
    const view = await render(<ExpoImage source={{ uri: "https://x/a.png" }} />);
    return (view.toJSON() as { type?: string } | null)?.type;
  });
  await probe("Text host", async () => {
    const view = await render(<Text>hi</Text>);
    return (view.toJSON() as { type?: string } | null)?.type;
  });
});

import React from "react";
import { vi } from "vitest";

/** The parts of the mock React Native that asset resolution reads. */
export interface ImageMockContext {
  AssetRegistry?: { getAssetByID(id: number): PackagerAsset | undefined };
  PixelRatio?: { get(): number };
  Platform?: { OS: string };
}

interface PackagerAsset {
  httpServerLocation: string;
  width?: number;
  height?: number;
  scales: number[];
  name: string;
  type: string;
}

// Libraries/Image/AssetUtils.js `pickScale`: the first scale at or above the
// device's, else the largest (scales are sorted), else 1.
function pickScale(scales: number[], deviceScale: number): number {
  for (const scale of scales) if (scale >= deviceScale) return scale;
  return scales[scales.length - 1] || 1;
}

// @react-native/asset-utils (AndroidPathUtils.js): density folder names and the file
// types Android treats as drawables.
const ANDROID_SCALE_SUFFIX: Record<string, string> = {
  "0.75": "ldpi",
  "1": "mdpi",
  "1.5": "hdpi",
  "2": "xhdpi",
  "3": "xxhdpi",
  "4": "xxxhdpi",
};
const ANDROID_DRAWABLE_TYPES = new Set([
  "gif",
  "heic",
  "heif",
  "jpeg",
  "jpg",
  "ktx",
  "png",
  "webp",
  "xml",
]);

/**
 * Libraries/Image/AssetSourceResolver.js `defaultAsset()` for a registered asset, in
 * the environment the native engine runs React Native in: no dev server, and a bundle
 * loaded from `file:///index.bundle` (the NativeSourceCode boundary mock), so the
 * bundle directory is `file:///`. iOS resolves the scaled file next to the bundle
 * (`scaledAssetURLNearBundle`); Android, loading from the file system, resolves the
 * density folder (`drawableFolderInBundle`, @react-native/asset-utils
 * `getAndroidResourceFolderName` + `getAndroidResourceIdentifier`).
 */
function resolveRegistered(asset: PackagerAsset, deviceScale: number, os: string) {
  const bundleDir = "file:///";
  const scale = pickScale(asset.scales, deviceScale);
  const basePath = asset.httpServerLocation.replace(/^\//, "");
  let uri: string;
  if (os === "android") {
    const suffix = ANDROID_SCALE_SUFFIX[String(scale)] ?? `${Math.round(scale * 160)}dpi`;
    const folder = ANDROID_DRAWABLE_TYPES.has(asset.type) ? `drawable-${suffix}` : "raw";
    const identifier = `${basePath}/${asset.name}`
      .toLowerCase()
      .replace(/\//g, "_")
      .replace(/([^a-z0-9_])/g, "")
      .replace(/^(?:assets|assetsunstable_path)_/, "");
    uri = `${bundleDir}${folder}/${identifier}.${asset.type}`;
  } else {
    const scaled = `${basePath}/${asset.name}${scale === 1 ? "" : `@${scale}x`}.${asset.type}`;
    uri = bundleDir + scaled.replace(/\.\.\//g, "_");
  }
  return { __packager_asset: true, width: asset.width, height: asset.height, uri, scale };
}

export function createImageMock(context: () => ImageMockContext = () => ({})) {
  const Image = React.forwardRef((props: any, ref: any) => {
    return React.createElement("Image", { ...props, ref });
  });
  Image.displayName = "Image";
  (Image as any).getSize = vi.fn((_uri: string, success: Function, _failure?: Function) => {
    Promise.resolve().then(() => success(100, 100));
  });
  (Image as any).getSizeWithHeaders = vi.fn(
    (_uri: string, _headers: any, success: Function, _failure?: Function) => {
      Promise.resolve().then(() => success(100, 100));
    },
  );
  (Image as any).prefetch = vi.fn(() => Promise.resolve(true));
  (Image as any).queryCache = vi.fn(() => Promise.resolve({}));
  (Image as any).resolveAssetSource = vi.fn((source: any) => {
    if (typeof source !== "number") return source;
    // Asset requires register with the mock's AssetRegistry, as Metro's asset
    // modules register with React Native's; resolve those as React Native does.
    const { AssetRegistry, PixelRatio, Platform } = context();
    const asset = AssetRegistry?.getAssetByID(source);
    if (asset) return resolveRegistered(asset, PixelRatio?.get() ?? 1, Platform?.OS ?? "ios");
    // A number nothing registered: a placeholder rather than React Native's null.
    return { uri: `asset://${source}`, width: 100, height: 100 };
  });
  return Image;
}

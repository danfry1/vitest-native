import React from "react";
import { vi } from "vitest";

export function createImageMock() {
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
    if (typeof source === "number") return { uri: `asset://${source}`, width: 100, height: 100 };
    return source;
  });
  return Image;
}

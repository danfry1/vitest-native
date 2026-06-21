// iOS platform-extension resolution (the default platform). Android resolution is
// covered by android.test.ts, but neither side tested *priority* — that the engine
// picks `.ios` over `.native` over the base file, matching Metro. These imports are
// resolved by Vite using the platform-ordered `resolve.extensions` the plugin sets.
import { describe, expect, it } from "vitest";
import { marker } from "./fixtures/plat/marker";
import { nativeOnly } from "./fixtures/plat/nativeonly";

describe("native engine: iOS platform-extension resolution", () => {
  it("prefers the .ios variant over .native and the base file", () => {
    // fixtures/plat/marker.{ios,android,native,}.ts all exist.
    expect(marker).toBe("ios");
  });

  it("falls back to .native when no platform-specific variant exists", () => {
    // fixtures/plat/nativeonly has only .native.ts and .ts.
    expect(nativeOnly).toBe("native");
  });
});

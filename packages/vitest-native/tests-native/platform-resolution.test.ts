// iOS platform-extension resolution (the default platform). Android resolution is
// covered by android.test.ts, but neither side tested *priority* — that the engine
// picks `.ios` over `.native` over the base file, matching Metro. These imports are
// resolved by Vite using the platform-ordered `resolve.extensions` the plugin sets.
import { describe, expect, it } from "vitest";
import { marker } from "./fixtures/plat/marker";
import { nativeOnly } from "./fixtures/plat/nativeonly";
import { pick } from "./fixtures/plat/pick";
import settings from "./fixtures/plat/settings";

describe("native engine: iOS platform-extension resolution", () => {
  it("prefers the .ios variant over .native and the base file", () => {
    // fixtures/plat/marker.{ios,android,native,}.ts all exist.
    expect(marker).toBe("ios");
  });

  it("falls back to .native when no platform-specific variant exists", () => {
    // fixtures/plat/nativeonly has only .native.ts and .ts.
    expect(nativeOnly).toBe("native");
  });

  it("prefers .js over .tsx within a group, as Metro's sourceExts order does", () => {
    // fixtures/plat/pick.{js,tsx} both exist. Metro's default sourceExts are
    // ["js","jsx","json","ts","tsx"], so a project with a compiled file beside its
    // source ships the .js — and must test the same one.
    expect(pick).toBe("js");
  });

  it("resolves an extensionless import to a .json file", () => {
    // json is a Metro source extension. Vite's default extension list is replaced
    // wholesale by the platform-ordered one, so omitting json here made
    // `import settings from './settings'` fail in a test while working in the app.
    expect(settings.answer).toBe(42);
  });
});

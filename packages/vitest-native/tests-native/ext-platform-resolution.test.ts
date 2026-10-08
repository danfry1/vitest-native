// Regression: an EXTERNALIZED node_modules package (the default for valid-node-import
// deps — Vitest's `_shouldExternalize` externalizes them, so they load through Node,
// NOT Vite). Node knows nothing about RN's Metro-style resolution, so the loader hook
// must supply it. Without these, real ecosystem packages (e.g. @react-navigation,
// which is externalized by default) silently load the wrong file or crash:
//
//   1. Platform extensions — `import './impl'` must resolve `impl.native.js` over
//      `impl.js`. Before the fix, Node's extensionless fallback picked `impl.js`
//      (the web/default variant) with no error — the @react-navigation `useLinking`
//      web-vs-native silent failure the trial report flagged (Issue 2).
//   2. ESM asset imports — `import icon from './icon.png'` throws "Unknown file
//      extension .png" in Node's ESM loader (Issue 3). Served as the module Metro
//      generates: the asset's id in React Native's own asset registry.
//   3. ESM JSON imports — `import data from './data.json'` (no `with { type: 'json' }`)
//      throws ERR_IMPORT_ATTRIBUTE_MISSING on Node 22+ (Issue 5). Served as a module.
import { describe, expect, it } from "vitest";
import { Image } from "react-native";
import { result } from "ext-platform-lib";

describe("externalized node_modules package: Metro-style resolution via the loader", () => {
  it("resolves the .native.js platform variant over the default .js", () => {
    expect(result.variant).toBe("native");
  });

  it("serves ESM asset imports as Metro's registering module", () => {
    // Through Node's ESM loader, not Vite — and still into the registry React
    // Native's resolveAssetSource reads. The fixture is a truncated PNG, so it
    // registers without dimensions instead of failing.
    expect(typeof result.icon).toBe("number");
    expect(Image.resolveAssetSource(result.icon)).toMatchObject({
      __packager_asset: true,
      uri: expect.stringMatching(/\/icon\.png$/),
    });
  });

  it("serves attribute-less ESM JSON imports as a module", () => {
    expect(result.answer).toBe(42);
  });

  it("serves an EXTENSIONLESS json import as a module too", () => {
    // `import settings from './settings'` next to settings.json. json is a Metro
    // source extension, so Metro-style resolution lands on the .json file — and it
    // still needs the import attribute. The platform-variant branch of the loader
    // resolved this one and returned it directly, skipping the attribute injection
    // that the explicit `./data.json` path goes through, so it threw
    // ERR_IMPORT_ATTRIBUTE_MISSING while its extension-bearing twin worked.
    expect(result.extensionless).toBe(true);
  });
});

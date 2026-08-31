/**
 * `server.deps.inline: true` is syntactically valid Vitest configuration and takes
 * precedence over every externalization pattern. Under the native engine that gives
 * one detected RN package to Vite while Node can still require it, producing two
 * live stores. The validation singleton gate proved the failure (`''` read after a
 * value was written through the other copy), so this must fail before collection.
 */
import path from "node:path";
import { createRequire } from "node:module";
import { describe, expect, it } from "vitest";
import { reactNative } from "../src/plugin.js";

describe("native ownership guard", () => {
  it("rejects inline-all with an actionable ownership explanation", async () => {
    const plugin = reactNative({ engine: "native" });
    await expect(
      plugin.config?.(
        {
          root: path.resolve(import.meta.dirname, ".."),
          test: { server: { deps: { inline: true } } },
        },
        { command: "serve", mode: "test" },
      ),
    ).rejects.toThrow(/separate module state.*Remove the overlapping inline rule/s);
  });

  it("rejects a narrow inline pattern that claims a detected Node package", async () => {
    const plugin = reactNative({ engine: "native" });
    await expect(
      plugin.config?.(
        {
          root: path.resolve(import.meta.dirname, ".."),
          test: { server: { deps: { inline: ["rn-singleton-lib"] } } },
        },
        { command: "serve", mode: "test" },
      ),
    ).rejects.toThrow(/overlaps Node-owned package: rn-singleton-lib/);
  });

  it("rechecks Vitest's final resolved inline rules", async () => {
    const root = path.resolve(import.meta.dirname, "..");
    const plugin = reactNative({ engine: "native" });
    await plugin.config?.({ root }, { command: "serve", mode: "test" });

    await expect(
      plugin.configResolved?.({
        root,
        plugins: [],
        test: { server: { deps: { inline: true } } },
      } as never),
    ).rejects.toThrow(/server\.deps\.inline:true/);
  });

  it("rejects an actual Vite transform of a Node-owned file", async () => {
    const root = path.resolve(import.meta.dirname, "..");
    const plugin = reactNative({ engine: "native" });
    await plugin.config?.({ root }, { command: "serve", mode: "test" });
    const nodeOwned = createRequire(import.meta.url).resolve("rn-singleton-lib");

    expect(() => plugin.transform?.("export const x = 1", nodeOwned)).toThrow(
      /Vite attempted to transform.*assigns.*to Node.*second module instance/s,
    );
  });
});

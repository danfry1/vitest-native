import path from "node:path";
import { fileURLToPath } from "node:url";
import { reactNative } from "../../src/index.js";

/**
 * Build React Native's precompiled registry for this package once, before any worker
 * starts.
 *
 * Many unit tests run the plugin's config hook for this package's root, and the
 * first one to run on a cold cache also compiles the registry: about 2 s locally and
 * over 5 s on a cache-less CI runner, where it timed out "auto (default) resolves to
 * native" in the v0.14.0-rc.0 release job. Pull-request legs restore a warm cache and
 * never saw it. The cold build landed on whichever test ran first (on a cold local
 * run, four others took 3-4.5 s), so a per-test opt-out would only move it. Warming
 * here keeps every test on the real registry, exactly as a warm cache does.
 */
export default async function setup(): Promise<void> {
  const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
  const plugin = reactNative({ engine: "native" }) as unknown as {
    config: { handler: (config: object, env: object) => Promise<unknown> };
  };
  await plugin.config.handler.call({}, { root }, { command: "serve", mode: "test" });
}

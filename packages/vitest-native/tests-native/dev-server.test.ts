/**
 * Proof: RN's `getDevServer` resolves under the native engine because the boundary
 * provides `SourceCode.getConstants().scriptURL`. Without it, getDevServer calls
 * `.match()` on `undefined` and throws — which under the native engine takes down
 * any test whose module graph reaches it (Expo's async-require `messageSocket`
 * pulls it in on Expo-core-importing suites). Surfaced by the obytes bake-off,
 * where the whole login-form file failed to collect for this reason.
 */
import { describe, it, expect } from "vitest";
// eslint-disable-next-line
import getDevServer from "react-native/Libraries/Core/Devtools/getDevServer";

describe("native engine: getDevServer / SourceCode.scriptURL", () => {
  it("resolves instead of crashing on undefined scriptURL", () => {
    // A non-string scriptURL would throw inside getDevServer (`.match`) before
    // returning; reaching here at all proves the boundary provides a string.
    const server = getDevServer();
    expect(typeof server.url).toBe("string");
  });

  it("reports the bundle as NOT loaded from a dev server (no network I/O)", () => {
    // The scriptURL is a file:// (bundled) URL, so getDevServer must not treat the
    // test as connected to Metro — otherwise RN internals / third-party SDKs would
    // attempt real fetches/WebSockets against localhost:8081.
    expect(getDevServer().bundleLoadedFromServer).toBe(false);
  });
});

/**
 * Reported item #4: `@react-native-community/datetimepicker` failed to compile with
 *
 *     Flow parse error at node_modules/@react-native-community/datetimepicker/
 *       src/datetimepicker.ios.js:23:13  (import type { DateTimePickerEvent })
 *
 * until the project added it to `transform` by hand. The reporter guessed the
 * detector had missed the package. It had not: datetimepicker declares react-native
 * in peerDependencies, which detectEcosystemPackages checks. The failure was that a
 * detected package was owned by Vite while its PLATFORM VARIANT was reached through
 * Node, which had no way to strip Flow from it.
 *
 * Node ownership fixes both halves at once: the resolver picks the .ios.js variant
 * and the same hooks that transform React Native strip its Flow.
 *
 * The fixture mirrors that package's shape — a `peerDependencies` declaration, an
 * entry that requires a platform variant, and a Flow type import inside the variant
 * — and is a declared dependency so detection genuinely considers it.
 */
import { expect, it } from "vitest";

it("compiles a Flow platform variant of an auto-detected package", async () => {
  const mod = (await import("rn-platform-flow-lib")) as unknown as {
    platform?: string;
    default?: { platform?: string };
  };
  expect(mod.platform ?? mod.default?.platform).toBe("ios");
});

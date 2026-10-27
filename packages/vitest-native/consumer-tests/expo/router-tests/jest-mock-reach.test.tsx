/**
 * A `jest.mock` factory reaches a package's own require of the mocked module, as under
 * Jest, whose one registry serves every load. expo-linking reads expo-constants for
 * the app's scheme; jest-expo suites mock expo-constants to set it. The engine's ESM
 * loader handed Node expo-linking's compiled source, and Node gave it a `require`
 * resolving through that loader rather than Module._load, where jest-compat serves
 * factories, so expo-linking read the real expo-constants and threw for a missing
 * manifest. (Here because this config loads the jest-compat layer.)
 */
import { expect, it } from "vitest";

jest.mock("expo-constants", () => {
  const actual = jest.requireActual("expo-constants");
  return {
    ...actual,
    __esModule: true,
    default: { ...actual.default, executionEnvironment: "bare", expoConfig: { scheme: "myapp" } },
  };
});

import * as Linking from "expo-linking";

it("serves the factory to expo-linking's own import of expo-constants", () => {
  expect(Linking.createURL("p")).toBe("myapp://p");
});

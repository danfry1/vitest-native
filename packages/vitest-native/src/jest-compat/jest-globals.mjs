// vitest-native/jest-compat/extend-expect-noop  → @jest/globals shim
//
// Alias `@jest/globals` to this so libraries that import it (notably
// @testing-library/react-native < 12) load under Vitest. Re-exports the Vitest
// globals under the names Jest's module provides, and maps `jest` → `vi` (with
// Jest's mock-function semantics for `jest.fn`/`jest.spyOn`; see jest-object.mjs).
import { expect, describe, it, test, beforeAll, afterAll, beforeEach, afterEach, vi } from "vitest";
import { currentJestObject } from "./jest-object.mjs";

export { expect, describe, it, test, beforeAll, afterAll, beforeEach, afterEach };
// The same object as the `jest` global (see installJestObject).
export const jest = currentJestObject(vi);

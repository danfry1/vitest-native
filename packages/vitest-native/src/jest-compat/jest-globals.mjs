// vitest-native/jest-compat/extend-expect-noop  → @jest/globals shim
//
// Alias `@jest/globals` to this so libraries that import it (notably
// @testing-library/react-native < 12) load under Vitest. Re-exports the Vitest
// globals under the names Jest's module provides, and maps `jest` → `vi`.
import { expect, describe, it, test, beforeAll, afterAll, beforeEach, afterEach, vi } from "vitest";

export { expect, describe, it, test, beforeAll, afterAll, beforeEach, afterEach };
export const jest = vi;

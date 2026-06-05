// vitest-native/jest-compat/setup
//
// Add to `test.setupFiles` to give an existing Jest suite a `jest` global backed
// by Vitest's `vi`. Real RN suites lean on `jest.fn`/`jest.requireActual`/
// `jest.useFakeTimers` etc.; Vitest exposes the same API as `vi` minus the sync
// `requireActual`/`requireMock`, which we add here.
//
// LIMITATION (documented in the migration guide): top-level `jest.mock(...)` is
// NOT hoisted by Vitest the way `vi.mock(...)` is — Vitest only hoists calls on
// the `vi`/`vitest` identifier. A `jest.mock('react-native', factory)` at module
// top level therefore runs AFTER imports and won't take effect. Convert those to
// `vi.mock(...)` per suite. `jest.fn`, `jest.spyOn`, `jest.requireActual`,
// `jest.useFakeTimers`, and `jest.mock` calls that don't depend on hoisting work.
import { vi } from "vitest";
import { createRequire } from "node:module";
import path from "node:path";

// Resolve modules from the consumer project root, not this file's location, so
// `jest.requireActual('some-project-dep')` resolves the same module the suite sees.
const projectRoot = process.env.VITEST_NATIVE_PROJECT_ROOT || process.cwd();
const require = createRequire(path.join(projectRoot, "package.json"));

if (typeof vi.requireActual !== "function") vi.requireActual = (m) => require(m);
if (typeof vi.requireMock !== "function") vi.requireMock = (m) => require(m);
// `jest.setTimeout(ms)` has no global `vi` equivalent — no-op so suites that call
// it at top level don't crash.
if (typeof vi.setTimeout !== "function") vi.setTimeout = () => {};

globalThis.jest = vi;

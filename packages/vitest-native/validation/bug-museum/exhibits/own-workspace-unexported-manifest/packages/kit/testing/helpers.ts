// A test helper the library ships beside its source. It imports vitest.
import { vi } from "vitest";

export const fakeFetch = vi.fn(() => "fake");
(globalThis as { __fakeFetch?: unknown }).__fakeFetch = fakeFetch;

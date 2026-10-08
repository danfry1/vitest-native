/**
 * One instance of a project module per test file, whichever loader is asked.
 *
 * Jest has one registry, so a module imported by the test and `require`d by something
 * else is one module. Here imports go through Vite and `require()` through Node; when
 * Node is asked for a project file Vite has already evaluated in this file, it gets
 * Vite's instance instead of loading a second copy whose state nobody configured.
 */
import { describe, expect, it } from "vitest";
import * as counter from "./fixtures/alias-app/registry/counter";
import { kind } from "./fixtures/alias-app/registry/session";

declare const jest: { requireActual<T = any>(path: string): T; resetModules(): void };

describe("a project module the file has imported", () => {
  it("is the module require() returns, state included", () => {
    const required = require("./fixtures/alias-app/registry/counter");
    expect(required.increment).toBe(counter.increment);
    counter.increment();
    expect(required.increment()).toBe(2);
  });

  it("is the module jest.requireActual returns", () => {
    expect(jest.requireActual("@vn-app/registry/counter").increment).toBe(counter.increment);
  });

  it("keeps its default export readable by CommonJS consumers", () => {
    const required = require("./fixtures/alias-app/registry/session");
    expect(required.__esModule).toBe(true);
    expect(required.kind).toBe(kind);
  });

  it("is loaded afresh by Node after jest.resetModules", () => {
    jest.resetModules();
    const required = require("./fixtures/alias-app/registry/counter");
    expect(required.increment).not.toBe(counter.increment);
    expect(required.increment()).toBe(1);
  });
});

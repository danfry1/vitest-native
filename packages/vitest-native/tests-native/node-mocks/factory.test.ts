/**
 * A vi.mock factory applies to an installed package's own require and import of the
 * mocked module (#322), as one instance with the test's import (R3), and an ES module's
 * default import reads the mock's `default` (R4).
 */
import { createRequire } from "node:module";
import { expect, it, vi } from "vitest";
import target from "dispatch-target-lib";
import * as targetNs from "dispatch-target-lib";
import { Platform } from "react-native";
import { importFrom, requireFrom } from "dispatch-consumer-lib";

const splitLibFile = createRequire(import.meta.url).resolve("dispatch-split-lib");

vi.mock("dispatch-target-lib", () => ({ source: "mock", default: { tag: "mock default" } }));

it("reaches an installed package's require, as the test's instance", () => {
  const required = requireFrom("dispatch-target-lib");
  expect(required.source).toBe("mock");
  expect(required.default).toBe(target);
  expect(requireFrom("dispatch-target-lib")).toBe(required);
});

it("costs an unrelated require from an installed package no resolution of its own", () => {
  type Stats = { resolves: number; toNode: number };
  const stats = (globalThis as { __vitest_native_jest_registry?: { stats: Stats } })
    .__vitest_native_jest_registry!.stats;
  requireFrom("react-native");
  const before = { ...stats };
  requireFrom("react-native");
  requireFrom("dispatch-split-lib");
  // By absolute path, as React Native's precompiled registry requires its helpers.
  requireFrom(splitLibFile);
  expect({
    resolves: stats.resolves - before.resolves,
    toNode: stats.toNode - before.toNode,
  }).toEqual({
    resolves: 0,
    toNode: 0,
  });
});

it("reaches an installed ES module's import, named and default", async () => {
  const consumer = (await importFrom("dispatch-consumer-lib/esm-consumer.mjs")) as {
    seen: string;
    defaultSeen: unknown;
  };
  expect(consumer.seen).toBe("mock");
  expect(consumer.defaultSeen).toBe(target);
  expect(targetNs.source).toBe("mock");
});

it("leaves the modules the test does not mock alone", () => {
  expect(requireFrom("react-native").Platform).toBe(Platform);
});

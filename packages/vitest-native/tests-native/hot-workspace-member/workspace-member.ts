// The checks every test file that touches the workspace library makes. Each file runs
// them after whatever ran before it in the same hot worker, so a file sees the library
// evaluated for it, holding its own store and class, or fails here.
import { expect } from "vitest";
import { Platform } from "react-native";
import { count, record } from "resident-singleton";
import { Box, store } from "@m/validator/store";
import { BoxClass, makeBox, platform, readStore } from "@m/feature";

const evaluations = () => (process as { __vnFeatureEvaluations?: number }).__vnFeatureEvaluations;

export function checkWorkspaceMember(label: string, previousFiles: number) {
  store.value = `written by ${label}`;
  expect(readStore(), "the library reads this file's store").toBe(`written by ${label}`);
  expect(makeBox(1), "the library's Box is this file's Box").toBeInstanceOf(Box);
  expect(BoxClass).toBe(Box);
  // Evaluated once for every file that reached it: once per earlier file, once now.
  expect(evaluations(), "the library was evaluated again for this file").toBe(previousFiles + 1);
  // React Native stays the worker's one instance (it is never re-evaluated per file).
  expect(platform).toBe(Platform);
  // An installed package keeps its per-file reset: fresh here, whatever ran before.
  expect(count()).toBe(0);
  record(label);
}

// Each file renders with its React and records weak references to it and to scheduler,
// on `process`, which the hot reset leaves alone. The last file collects garbage and counts
// how many earlier files' copies are still alive.
import React from "react";
import { Text } from "react-native";
import { render, screen } from "@testing-library/react-native";
import { createRequire } from "node:module";
import v8 from "node:v8";
import vm from "node:vm";

// scheduler as React Native reaches it (it is not a dependency of this package).
const fromReactNative = createRequire(
  createRequire(import.meta.url).resolve("react-native/package.json"),
);

type Held = { file: string; react: WeakRef<object>; scheduler: WeakRef<object> };
const held = ((process as { __vnFreshHeld?: Held[] }).__vnFreshHeld ??= []);

export async function holdThisFile(file: string) {
  await render(<Text>{file}</Text>);
  expect(screen.getByText(file)).toBeTruthy();
  held.push({
    file,
    react: new WeakRef(React as object),
    scheduler: new WeakRef(fromReactNative("scheduler") as object),
  });
}

/** Collects garbage fully, then returns the heap in use. */
export async function collect(): Promise<number> {
  v8.setFlagsFromString("--expose-gc");
  const gc = vm.runInNewContext("gc") as () => void;
  // Let pending timers and microtasks of earlier files settle, then collect twice (WeakRef
  // targets are cleared only after the job that created them ends).
  await new Promise((resolve) => setTimeout(resolve, 50));
  gc();
  await new Promise((resolve) => setTimeout(resolve, 0));
  gc();
  return process.memoryUsage().heapUsed;
}

/** Earlier files whose React or scheduler survives a full collection. */
export function survivors(): string[] {
  return held
    .slice(0, -1)
    .filter((h) => h.react.deref() !== undefined || h.scheduler.deref() !== undefined)
    .map((h) => h.file);
}

/** Every file's React, where still reachable. */
export const reacts = () => held.map((h) => h.react.deref());

export const heldCount = () => held.length;

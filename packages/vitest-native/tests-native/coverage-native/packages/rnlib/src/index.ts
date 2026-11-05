import { Platform } from "react-native";

export type Grade = "high" | "low" | "none";

export interface Scored {
  score: number;
}

export function grade(input: Scored): Grade {
  if (input.score > 50) {
    return "high";
  }
  if (input.score > 0) {
    return "low";
  }
  return "none";
}

export function platformName(): string {
  return Platform.OS;
}

export function neverCalled(value: number): number {
  const doubled = value * 2;
  return doubled + 1;
}

export { Badge } from "./Badge";

// Module-level code below the functions: statements the module runs as it loads, at
// offsets an ES module import's facade (loader.mjs) also spans.
export const levels: Grade[] = ["high", "low", "none"];

let initialised = false;
if (levels.length > 0) {
  initialised = true;
} else {
  initialised = false;
}

export function isInitialised(): boolean {
  return initialised;
}

import { device } from "./storage";

// Module-level state, so a test can tell a fresh module from a cached one.
let value = 0;
export function increment(): number {
  return ++value;
}
export function storageKey(key: string): string {
  return device.get(key);
}

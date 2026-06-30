// A module-level store imported by multiple test files. If the per-file module
// reset works, each file re-evaluates this module and `count` starts at 0; if
// module state bleeds across files, a later file sees a non-zero starting value.
let count = 0;
const listeners = new Set<() => void>();

export function increment() {
  count += 1;
  listeners.forEach((l) => l());
}
export function getCount() {
  return count;
}
export function subscribe(l: () => void) {
  listeners.add(l);
  return () => listeners.delete(l);
}

// The matchers and equality testers a test file adds to Vitest's `expect`. Vitest and
// chai are resident under the hot runtime, and `expect.extend` writes to objects they
// share for the worker's life: chai's Assertion.prototype (`expect(x).toBeX()`), the
// Jest matchers object (`this` in other matchers, soft assertions) and the asymmetric
// matchers object every file's `expect` copies (`expect.toBeX()`).
// `expect.addEqualityTesters` appends to a shared list. Without a reset, a matcher one
// file added passed in a later file that never added it (#808). Jest and per-file
// isolation give each file only what its setup files add.
const JEST_MATCHERS = Symbol.for("$$jest-matchers-object");
const ASYMMETRIC_MATCHERS = Symbol.for("asymmetric-matchers-object");

/** The shared objects `expect.extend` writes to, found from one `expect`. */
function targets(expect) {
  const jest = globalThis[JEST_MATCHERS];
  return {
    objects: [
      // expect.toBeX() and expect.not.toBeX(): Vitest's exported `expect` is one object
      // for the worker.
      expect,
      expect.not,
      Object.getPrototypeOf(expect(null)),
      jest?.matchers,
      globalThis[ASYMMETRIC_MATCHERS],
    ].filter(
      (target) => target !== null && (typeof target === "object" || typeof target === "function"),
    ),
    testers: Array.isArray(jest?.customEqualityTesters) ? jest.customEqualityTesters : null,
  };
}

const descriptors = (target) =>
  new Map(
    Reflect.ownKeys(target).map((key) => [key, Object.getOwnPropertyDescriptor(target, key)]),
  );

const sameDescriptor = (left, right) =>
  left !== undefined &&
  right !== undefined &&
  ["value", "get", "set", "writable", "enumerable", "configurable"].every((field) =>
    Object.is(left[field], right[field]),
  );

/** What the shared objects hold now: the state each later file starts from. */
export function captureMatchers(expect) {
  const { objects, testers } = targets(expect);
  return {
    objects: objects.map((target) => ({ target, baseline: descriptors(target) })),
    testers: testers && { list: testers, baseline: [...testers] },
  };
}

/** Removes what files added since the capture, and puts back what they replaced. */
export function restoreMatchers(snapshot) {
  for (const { target, baseline } of snapshot.objects) {
    for (const key of Reflect.ownKeys(target)) {
      if (!baseline.has(key)) delete target[key];
    }
    for (const [key, descriptor] of baseline) {
      if (!sameDescriptor(Object.getOwnPropertyDescriptor(target, key), descriptor)) {
        Object.defineProperty(target, key, descriptor);
      }
    }
  }
  if (snapshot.testers) snapshot.testers.list.splice(0, Infinity, ...snapshot.testers.baseline);
}

/** The first difference from the capture, or null. */
export function matcherDifference(snapshot) {
  for (const { target, baseline } of snapshot.objects) {
    for (const key of Reflect.ownKeys(target)) {
      if (!baseline.has(key)) return `a matcher added since the worker started: ${String(key)}`;
    }
    for (const [key, descriptor] of baseline) {
      if (!sameDescriptor(Object.getOwnPropertyDescriptor(target, key), descriptor)) {
        return `a matcher replaced since the worker started: ${String(key)}`;
      }
    }
  }
  const testers = snapshot.testers;
  if (
    testers &&
    (testers.list.length !== testers.baseline.length ||
      testers.list.some((tester, index) => tester !== testers.baseline[index]))
  ) {
    return "equality testers added since the worker started";
  }
  return null;
}

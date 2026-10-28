// Equality of two Errors that carry methods as own properties.
//
// Vitest compares two Errors by their toString tag, name, message, cause (when the
// expected one has one), AggregateError `errors`, and every own enumerable property
// (`isErrorEqual` in vitest 5.0.5 dist/chunks/index.aTZaPVhf.js:1344, which spreads
// `{ ...a }` against `{ ...b }`). An error class that assigns methods as per-instance
// fields — zod 3's ZodError does, `addIssue = (sub) => …` and `addIssues = …` in its
// constructor — gives every instance its own closures. Two closures are never equal, so
// two identical ZodErrors are never equal: `toEqual`, `rejects.toEqual` and
// `toThrow(instance)` all fail with "Compared values have no visual difference". Jest
// passes them, because Jest compares two Errors by message alone (@jest/expect-utils
// 30.2.0 build/index.js:179).
//
// Adopting Jest's rule would be more lenient than Jest itself: a custom tester runs
// before Vitest's `typeEquality`, so a message-only tester makes
// `expect(TypeError('x')).toStrictEqual(Error('x'))` pass, and Vitest's toThrow
// compares through the same testers, so it would also ignore a differing `cause`, which
// Jest 30's toThrow(object) checks (expect 30.2.0 build/index.js:1879-1884). So this
// keeps Vitest's comparison and changes one thing: an own enumerable property that is a
// function on BOTH errors is left out. A function on an error instance is behaviour, not
// data — no error is distinguished from another by which closure it carries — and the
// comparison is otherwise exactly Vitest's, so it is never more lenient than Vitest
// anywhere a function-valued field is not involved. A property that is a function on
// one side only (a method against a value, or a missing key) still differs.
//
// The tester returns undefined, leaving the pair to Vitest, unless both are Errors
// sharing such a property. It is registered by the jest-compat setup, and `expect` is
// shared, so Vitest-style assertions in the same project get it too.

/** Vitest's `isError` (index.aTZaPVhf.js:1246), so the same values count as Errors. */
function isError(value) {
  if (typeof Error.isError === "function") return Error.isError(value);
  switch (Object.prototype.toString.call(value)) {
    case "[object Error]":
    case "[object Exception]":
    case "[object DOMException]":
      return true;
    default:
      return value instanceof Error;
  }
}

/** Own enumerable keys, strings and symbols, as `{ ...value }` copies them. */
const ownEnumerableKeys = (value) =>
  Reflect.ownKeys(value).filter((key) => Object.prototype.propertyIsEnumerable.call(value, key));

/** Keys whose value is a function on both errors. */
function sharedMethodKeys(a, b) {
  const keys = new Set();
  for (const key of ownEnumerableKeys(a)) {
    if (
      typeof a[key] === "function" &&
      Object.prototype.propertyIsEnumerable.call(b, key) &&
      typeof b[key] === "function"
    ) {
      keys.add(key);
    }
  }
  return keys;
}

/**
 * `{ ...value }` without `skip`. The spread defines each key, where assigning would run
 * the `__proto__` setter for an own `__proto__` key and hide that key's value.
 */
function ownData(value, skip) {
  const data = { ...value };
  for (const key of skip) delete data[key];
  return data;
}

// Errors being compared on this call stack, so a cycle through a cause or a property
// ends as Vitest's `eq` ends one: a pair met again is equal only at the same depth.
// Recursion goes through `this.equals`, which starts fresh stacks of its own.
const aStack = [];
const bStack = [];

export function errorsWithMethodsEquality(a, b, customTesters) {
  // Vitest runs the testers on every pair it compares, primitives and plain objects
  // included, so the common case returns before `isError`.
  if (typeof a !== "object" || typeof b !== "object" || a === null || b === null) {
    return undefined;
  }
  if (a === b || !isError(a) || !isError(b)) return undefined;
  if (typeof this?.equals !== "function") return undefined;
  const skip = sharedMethodKeys(a, b);
  if (skip.size === 0) return undefined;

  // The testers after this one are the ones Vitest would still have run on this pair
  // (eq's loop, index.aTZaPVhf.js:1262). toStrictEqual appends `typeEquality` to the
  // list, so its constructor check is kept, and a user tester registered later still
  // decides its own errors.
  const testers = Array.isArray(customTesters) ? customTesters : [];
  for (const tester of testers.slice(testers.indexOf(errorsWithMethodsEquality) + 1)) {
    const result = tester.call(this, a, b, testers);
    if (result !== undefined) return result;
  }
  // A tester sees no strict flag. toStrictEqual is the matcher that passes Vitest's
  // `typeEquality` (index.aTZaPVhf.js:2020-2029), and its strict check is what makes an
  // `undefined`-valued property differ from a missing one.
  const strict = testers.some((tester) => tester.name === "typeEquality");

  let depth = aStack.length;
  while (depth--) {
    if (aStack[depth] === a) return bStack[depth] === b;
    if (bStack[depth] === b) return false;
  }
  aStack.push(a);
  bStack.push(b);
  try {
    // isErrorEqual (index.aTZaPVhf.js:1344-1357), in its order.
    const equals = (x, y) => this.equals(x, y, testers, strict);
    let result =
      Object.prototype.toString.call(a) === Object.prototype.toString.call(b) &&
      a.name === b.name &&
      a.message === b.message;
    if (typeof b.cause !== "undefined") result &&= equals(a.cause, b.cause);
    if (a instanceof AggregateError && b instanceof AggregateError) {
      result &&= equals(a.errors, b.errors);
    }
    result &&= equals(ownData(a, skip), ownData(b, skip));
    return result;
  } finally {
    aStack.pop();
    bStack.pop();
  }
}

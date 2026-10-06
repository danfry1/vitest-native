// The `jest` object the compat layer hands out: Vitest's `vi`, except for the mock
// factories, whose semantics differ from Jest's in one place real suites depend on.
//
// Jest's mock function (jest-mock's ModuleMocker, `_makeComponent`) runs its
// implementation as `mockImpl.apply(this, arguments)` whether or not it was invoked
// with `new`. A constructor call therefore works with any implementation, arrows
// included: `new` returns the implementation's result when that is an object, and the
// fresh instance otherwise — ordinary [[Construct]] semantics for a function that
// returns a value. So this is routine in Jest suites, and passes:
//
//   jest.mock('x', () => ({ Api: jest.fn().mockImplementation(() => ({ fetch })) }))
//   new Api()   // → { fetch }
//
// Vitest 4+ constructs the implementation itself (`Reflect.construct(impl, args,
// new.target)` in @vitest/spy), so an arrow implementation throws `… is not a
// constructor`, and `mockReturnValue`/`mockResolvedValue` throw a dedicated error
// under `new`. That is a deliberate Vitest design, so `vi.fn` is left exactly as it
// is: only the mocks made through `jest.fn`/`jest.spyOn` get Jest's behaviour.
//
// It is done by adapting the implementation rather than the mock. A non-constructible
// implementation (arrow, method shorthand, async or generator function) is passed to
// Vitest inside a plain `function` that applies it — which is constructible, so
// Vitest's `Reflect.construct` calls it with the new instance as `this`, and its
// object result, if any, becomes the result of `new`. A constructible implementation
// (`function`, `class`) is passed unchanged, so classes keep Vitest's construction
// (Jest's own `.apply` would throw "Class constructor cannot be invoked without
// 'new'" there; nobody depends on that). Everything else — `.mock.calls`,
// `.mock.instances`, `vi.isMockFunction`, `jest.mocked`, reset/restore — is Vitest's
// own mock, untouched.
//
// The value-returning helpers are redefined the way jest-mock defines them,
// `mockReturnValue(v)` as `mockImplementation(() => v)` and so on, so they follow the
// same rule.

const JEST_SEMANTICS = Symbol.for("vitest-native.jest-compat.jest-semantics");

/** The implementation each adapter wraps, so `getMockImplementation()` returns what was passed. */
const adapted = new WeakMap();

/**
 * Whether `fn` has [[Construct]]. `Reflect.construct` checks its `newTarget` before
 * calling anything, and the target here is `String`, so this never runs `fn`.
 */
function isConstructor(fn) {
  try {
    Reflect.construct(String, [], fn);
    return true;
  } catch {
    return false;
  }
}

const NOT_COPIED = new Set(["length", "name", "prototype", "caller", "arguments"]);

function asJestImplementation(impl) {
  if (typeof impl !== "function" || isConstructor(impl)) return impl;
  const adapter = function (...args) {
    return impl.apply(this, args);
  };
  // No prototype of its own: @vitest/spy re-parents `mock.prototype` onto the
  // implementation's prototype, and an arrow has none, so leaving one here would put
  // an unrelated empty object into every instance's chain.
  adapter.prototype = undefined;
  Object.defineProperty(adapter, "length", { value: impl.length, configurable: true });
  Object.defineProperty(adapter, "name", { value: impl.name, configurable: true });
  // Vitest copies the implementation's static members onto the mock (`jest.fn(impl)`
  // exposing `impl.x` as `mock.x`); it reads them from what it is given, so give it them.
  for (const key of Reflect.ownKeys(impl)) {
    if (NOT_COPIED.has(key)) continue;
    Object.defineProperty(adapter, key, Object.getOwnPropertyDescriptor(impl, key));
  }
  adapted.set(adapter, impl);
  return adapter;
}

/** Give a Vitest mock Jest's handling of implementations under `new`. */
function withJestSemantics(mock) {
  if (mock[JEST_SEMANTICS]) return mock;
  const { mockImplementation, mockImplementationOnce, withImplementation, getMockImplementation } =
    mock;
  mock.mockImplementation = (impl) => mockImplementation.call(mock, asJestImplementation(impl));
  mock.mockImplementationOnce = (impl) =>
    mockImplementationOnce.call(mock, asJestImplementation(impl));
  mock.withImplementation = (impl, callback) =>
    withImplementation.call(mock, asJestImplementation(impl), callback);
  mock.getMockImplementation = () => {
    const impl = getMockImplementation.call(mock);
    return adapted.get(impl) ?? impl;
  };
  // As jest-mock defines them (packages/jest-mock/src/index.ts).
  mock.mockReturnValue = (value) => mock.mockImplementation(() => value);
  mock.mockReturnValueOnce = (value) => mock.mockImplementationOnce(() => value);
  mock.mockResolvedValue = (value) => mock.mockImplementation(() => Promise.resolve(value));
  mock.mockResolvedValueOnce = (value) => mock.mockImplementationOnce(() => Promise.resolve(value));
  mock.mockRejectedValue = (value) => mock.mockImplementation(() => Promise.reject(value));
  mock.mockRejectedValueOnce = (value) => mock.mockImplementationOnce(() => Promise.reject(value));
  Object.defineProperty(mock, JEST_SEMANTICS, { value: true });
  return mock;
}

function findDescriptor(object, key) {
  for (let o = object; o != null; o = Object.getPrototypeOf(o)) {
    const descriptor = Object.getOwnPropertyDescriptor(o, key);
    if (descriptor) return descriptor;
  }
  return undefined;
}

/**
 * The `jest` object: `vi` for everything except `fn` and `spyOn`. A proxy rather than
 * a copy, so members the compat setup installs on `vi` (requireActual, the timer
 * guards), and anything a suite assigns to `jest.*`, stay one shared object.
 */
export function createJestObject(vi) {
  function fn(impl) {
    // `vi.fn(existingMock)` returns that mock; it is someone else's, so leave it be.
    if (vi.isMockFunction(impl)) return vi.fn(impl);
    return withJestSemantics(vi.fn(asJestImplementation(impl)));
  }
  function spyOn(...args) {
    // Likewise `vi.spyOn` on a property that already holds a mock returns that mock.
    // Read the descriptor rather than the property, so an accessor is not invoked.
    const [object, key, accessType] = args;
    const existing = accessType === undefined ? findDescriptor(object, key)?.value : undefined;
    const spy = vi.spyOn(...args);
    return vi.isMockFunction(existing) ? spy : withJestSemantics(spy);
  }
  return new Proxy(vi, {
    get(target, prop, receiver) {
      if (prop === "fn") return fn;
      if (prop === "spyOn") return spyOn;
      return Reflect.get(target, prop, receiver);
    },
  });
}

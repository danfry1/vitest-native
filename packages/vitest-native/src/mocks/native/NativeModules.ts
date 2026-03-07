/**
 * Creates a recursive proxy that returns no-op functions for any property access.
 * This ensures NativeModules.Foo.bar() works without throwing TypeError,
 * and NativeModules.Foo.bar.baz() also works (arbitrary depth).
 *
 * Property accesses are cached so that NativeModules.Foo === NativeModules.Foo
 * holds true, matching real React Native identity semantics.
 */
function createModuleProxy(): Record<string, any> {
  const cache = new Map<string | symbol, any>();
  const noop = () => {};
  return new Proxy(noop, {
    get(_target, prop) {
      if (typeof prop === "symbol") return undefined;
      if (cache.has(prop)) return cache.get(prop);
      const child = createModuleProxy();
      cache.set(prop, child);
      return child;
    },
    apply() {
      return undefined;
    },
  });
}

export function createNativeModulesMock(): Record<string, any> {
  const cache = new Map<string | symbol, any>();
  return new Proxy({} as Record<string, any>, {
    get(_target, prop) {
      if (typeof prop === "symbol") return undefined;
      if (cache.has(prop)) return cache.get(prop);
      const child = createModuleProxy();
      cache.set(prop, child);
      return child;
    },
  });
}

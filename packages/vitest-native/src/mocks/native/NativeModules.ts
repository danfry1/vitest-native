/**
 * Creates a callable proxy — used for module methods.
 * Calling it returns undefined; accessing properties returns another
 * callable proxy (supporting arbitrary depth like Foo.bar.baz()).
 */
function createCallableProxy(): any {
  const cache = new Map<string | symbol, any>();
  const noop = () => {};
  return new Proxy(noop, {
    get(_target, prop) {
      if (typeof prop === "symbol") return undefined;
      if (cache.has(prop)) return cache.get(prop);
      const child = createCallableProxy();
      cache.set(prop, child);
      return child;
    },
    apply() {
      return undefined;
    },
  });
}

/**
 * Creates an object proxy for a native module.
 * typeof returns "object" (matching real RN), property access returns
 * callable proxies so NativeModules.Foo.bar() works without throwing.
 *
 * Property accesses are cached so that NativeModules.Foo === NativeModules.Foo
 * holds true, matching real React Native identity semantics.
 */
function createModuleProxy(): Record<string, any> {
  const cache = new Map<string | symbol, any>();
  return new Proxy({} as Record<string, any>, {
    get(_target, prop) {
      if (typeof prop === "symbol") return undefined;
      if (cache.has(prop)) return cache.get(prop);
      const child = createCallableProxy();
      cache.set(prop, child);
      return child;
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

function createModuleProxy(): Record<string, any> {
  return new Proxy(
    {},
    {
      get(_target, prop) {
        if (typeof prop === "symbol") return undefined;
        if (prop === "then") return undefined; // prevent promise detection
        return () => {};
      },
    },
  );
}

export function createTurboModuleRegistryMock() {
  return {
    getEnforcing(_name: string): Record<string, any> {
      return createModuleProxy();
    },
    get(_name: string): Record<string, any> | null {
      return null;
    },
  };
}

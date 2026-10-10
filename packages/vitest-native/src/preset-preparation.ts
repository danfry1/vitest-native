import { VitestNativeError } from "./errors.mjs";

/**
 * What require() returns for a preset module that is still preparing: it forwards to
 * the module once built and, before that, says why there is nothing yet rather than
 * letting the real package load (Skia's throws a JSI binding error).
 */
export function untilPrepared(
  modName: string,
  get: () => Record<string, any> | undefined,
): Record<string, any> {
  const module = (): Record<string, any> => {
    const built = get();
    if (built) return built;
    throw new VitestNativeError(
      "PRESET_NOT_PREPARED",
      `'${modName}' was required before its preset finished preparing. Import it ` +
        `(import ... from '${modName}'), which waits for the preset, or require it ` +
        `inside a test rather than at module scope.`,
    );
  };
  return new Proxy(Object.create(null), {
    get: (_target, key) => module()[key as string],
    set: (_target, key, value) => {
      module()[key as string] = value;
      return true;
    },
    has: (_target, key) => key in module(),
    ownKeys: () => Reflect.ownKeys(module()),
    getOwnPropertyDescriptor: (_target, key) => {
      const descriptor = Reflect.getOwnPropertyDescriptor(module(), key);
      return descriptor && { ...descriptor, configurable: true };
    },
  });
}

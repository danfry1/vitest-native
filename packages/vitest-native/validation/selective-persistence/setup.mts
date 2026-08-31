import { installGlobals } from "../../src/native/globals.mjs";
import { vi } from "vitest";

installGlobals();
await import("virtual:vitest-native-single-graph-error-utils");
process.env.EXPO_OS ??= "ios";
const eventTarget = globalThis as any;
eventTarget.addEventListener ??= () => {};
eventTarget.removeEventListener ??= () => {};
eventTarget.dispatchEvent ??= () => true;
const { default: ReactNative } = await import("react-native");

const STATE_KEY = "__vitest_native_selective_persistence_state__";
const REFERENCE_KEY = "__vitest_native_selective_persistence_rn__";
const ENV_PRESERVED = new Set(["VITEST_POOL_ID", "VITEST_WORKER_ID"]);

type ResidentState = {
  reset(): void;
};

const EXPO_RUNTIME_GLOBALS = [
  "TextDecoder",
  "TextDecoderStream",
  "TextEncoderStream",
  "URL",
  "URLSearchParams",
  "DOMException",
  "__ExpoImportMetaRegistry",
  "structuredClone",
  "fetch",
  "Headers",
  "Request",
  "Response",
  "FormData",
] as const;

function descriptorSnapshot(object: object, keys: readonly PropertyKey[]) {
  return new Map(keys.map((key) => [key, Object.getOwnPropertyDescriptor(object, key)]));
}

function restoreDescriptors(
  object: object,
  descriptors: Map<PropertyKey, PropertyDescriptor | undefined>,
) {
  for (const [key, descriptor] of descriptors) {
    try {
      if (descriptor) Object.defineProperty(object, key, descriptor);
      else delete (object as any)[key];
    } catch {}
  }
}

function installResidentStateReset(): ResidentState {
  const dimensions = {
    window: { ...ReactNative.Dimensions.get("window") },
    screen: { ...ReactNative.Dimensions.get("screen") },
  };
  const colorScheme = ReactNative.Appearance.getColorScheme?.() ?? null;
  const env = { ...process.env };
  const globalKeys = new Set(Reflect.ownKeys(globalThis));
  const expoGlobals = descriptorSnapshot(globalThis, EXPO_RUNTIME_GLOBALS);
  const consoleMethods = descriptorSnapshot(console, [
    "trace",
    "info",
    "warn",
    "error",
    "log",
    "group",
    "groupCollapsed",
    "groupEnd",
    "debug",
  ]);
  const formDataPrototype = globalThis.FormData?.prototype;
  const formDataMethods = formDataPrototype
    ? descriptorSnapshot(formDataPrototype, [
        "append",
        "set",
        "delete",
        "get",
        "getAll",
        "has",
        "forEach",
        "entries",
        "keys",
        "values",
        Symbol.iterator,
      ])
    : null;
  const abortSignal = globalThis.AbortSignal;
  const abortSignalStatics = abortSignal
    ? descriptorSnapshot(abortSignal, ["timeout", "any"])
    : null;
  const errorHandler = (globalThis as any).ErrorUtils?.getGlobalHandler?.();
  const subscriptions = new Set<{ remove(): void }>();
  const emitter = ReactNative.DeviceEventEmitter;
  const addListener = emitter.addListener.bind(emitter);

  emitter.addListener = (
    type: string,
    listener: (...args: unknown[]) => unknown,
    context?: unknown,
  ) => {
    const subscription = addListener(type, listener, context);
    subscriptions.add(subscription);
    return subscription;
  };

  return {
    reset() {
      const boundaryResets = (globalThis as any).__vitest_native_resets;
      if (Array.isArray(boundaryResets)) {
        for (const reset of boundaryResets) {
          try {
            reset();
          } catch {}
        }
      }

      ReactNative.Dimensions.set(dimensions);
      ReactNative.Appearance.setColorScheme?.(colorScheme);

      for (const subscription of subscriptions) {
        try {
          subscription.remove();
        } catch {}
      }
      subscriptions.clear();

      delete (globalThis as any).__vitest_native_route_modules;
      delete (globalThis as any).__vitest_native_load_route;
      restoreDescriptors(globalThis, expoGlobals);
      restoreDescriptors(console, consoleMethods);
      if (formDataPrototype && formDataMethods)
        restoreDescriptors(formDataPrototype, formDataMethods);
      if (abortSignal && abortSignalStatics) restoreDescriptors(abortSignal, abortSignalStatics);
      if (errorHandler) (globalThis as any).ErrorUtils?.setGlobalHandler?.(errorHandler);

      for (const key of Object.keys(process.env)) {
        if (ENV_PRESERVED.has(key)) continue;
        if (!(key in env)) delete process.env[key];
        else process.env[key] = env[key];
      }
      for (const key of Object.keys(env)) {
        if (!(key in process.env) && !ENV_PRESERVED.has(key)) process.env[key] = env[key];
      }

      for (const key of Reflect.ownKeys(globalThis)) {
        if (globalKeys.has(key)) continue;
        if (key === STATE_KEY || key === REFERENCE_KEY) continue;
        if (
          typeof key === "string" &&
          /^(__vitest_native_|__VITEST|__coverage__|__VITE)/.test(key)
        ) {
          continue;
        }
        try {
          delete (globalThis as any)[key];
        } catch {}
      }
    },
  };
}

const existing = (globalThis as any)[STATE_KEY] as ResidentState | undefined;
if (existing) {
  vi.useRealTimers();
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
  existing.reset();
} else (globalThis as any)[STATE_KEY] = installResidentStateReset();

if ((globalThis as any)[REFERENCE_KEY] && (globalThis as any)[REFERENCE_KEY] !== ReactNative) {
  throw new Error("selective persistence created a second React Native actual instance");
}
(globalThis as any)[REFERENCE_KEY] = ReactNative;

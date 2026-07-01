import type { Preset } from "../types.js";

// react-native-worklets is reanimated's low-level runtime (and is imported
// directly by apps, e.g. `import { scheduleOnUI } from 'react-native-worklets'`).
// It ships a Jest mock at `react-native-worklets/lib/module/mock`, but that file
// is ESM that ends with `module.exports = …`; under the native engine RN and its
// ecosystem are externalized, so requiring it through Node throws "module is not
// defined in ES module scope" and takes down the whole test file.
//
// This preset shadows the package with a self-contained mock modelled on
// worklets' own `mock.js` WorkletAPI. Schedulers run their worklet synchronously
// (matching the reanimated preset's `runOnJS`/`runOnUI => fn` convention) so
// UI-thread work is observable in tests without fake-timer juggling.

// Mirrors worklets' RuntimeKind enum (lib/module/runtimeKind.js). Tests run on
// the React Native runtime.
const RuntimeKind = { ReactNative: 1, UI: 2, Worker: 3 } as const;

const NOOP = () => {};
const ID = <T>(value: T): T => value;
const invoke = (callback: () => any) => callback();

export function worklets(): Preset {
  return {
    name: "worklets",
    modules: {
      "react-native-worklets": {
        exports: [
          "runOnJS",
          "runOnUI",
          "runOnUIAsync",
          "runOnUISync",
          "scheduleOnRN",
          "scheduleOnUI",
          "runOnRuntime",
          "runOnRuntimeAsync",
          "runOnRuntimeSync",
          "scheduleOnRuntime",
          "executeOnUIRuntimeSync",
          "createWorkletRuntime",
          "getRuntimeKind",
          "isRNRuntime",
          "isUIRuntime",
          "isWorkerRuntime",
          "isWorkletRuntime",
          "RuntimeKind",
          "makeShareable",
          "makeShareableCloneRecursive",
          "makeShareableCloneOnUIRecursive",
          "isShareable",
          "isShareableRef",
          "createShareable",
          "shareableMappingCache",
          "createSerializable",
          "isSerializableRef",
          "registerCustomSerializable",
          "serializableMappingCache",
          "createSynchronizable",
          "isSynchronizable",
          "getStaticFeatureFlag",
          "getDynamicFeatureFlag",
          "setDynamicFeatureFlag",
          "callMicrotasks",
          "isWorkletFunction",
          "WorkletsModule",
          "UIRuntimeId",
        ],
        factory: () => {
          // Schedulers execute the worklet immediately on the current thread —
          // there is no separate UI runtime under test.
          const runOnJS = (fn: Function) => fn;
          const runOnUI = (fn: Function) => fn;
          // Direct call form: `runOnUIAsync(worklet, ...args)` returns a Promise
          // (unlike `runOnUI(worklet)(...args)`, which is curried).
          const runOnUIAsync = (worklet: Function, ...args: any[]) =>
            Promise.resolve(worklet(...args));

          const api: Record<string, any> = {
            __esModule: true,

            // Scheduling
            runOnJS,
            runOnUI,
            runOnUIAsync,
            runOnUISync: invoke,
            scheduleOnRN: (fn: Function, ...args: any[]) => fn(...args),
            scheduleOnUI: (worklet: Function, ...args: any[]) => worklet(...args),
            runOnRuntime: ID,
            runOnRuntimeAsync: (_runtime: unknown, worklet: Function, ...args: any[]) =>
              Promise.resolve(worklet(...args)),
            runOnRuntimeSync: (_runtime: unknown, worklet: Function, ...args: any[]) =>
              worklet(...args),
            scheduleOnRuntime: invoke,
            executeOnUIRuntimeSync: ID,
            callMicrotasks: NOOP,

            // Runtimes
            createWorkletRuntime: () => ({}),
            getRuntimeKind: () => RuntimeKind.ReactNative,
            RuntimeKind,
            isRNRuntime: () => true,
            isUIRuntime: () => false,
            isWorkerRuntime: () => false,
            isWorkletRuntime: () => false,
            UIRuntimeId: 1,

            // Shareables / serializables — identity in tests
            makeShareable: ID,
            makeShareableCloneRecursive: ID,
            makeShareableCloneOnUIRecursive: ID,
            createShareable: ID,
            isShareable: () => false,
            isShareableRef: () => true,
            shareableMappingCache: new Map(),
            createSerializable: ID,
            isSerializableRef: ID,
            registerCustomSerializable: NOOP,
            serializableMappingCache: new Map(),
            createSynchronizable: ID,
            isSynchronizable: () => false,

            // Feature flags
            getStaticFeatureFlag: () => false,
            getDynamicFeatureFlag: () => false,
            setDynamicFeatureFlag: NOOP,

            // A worklet detection always reports false on the RN runtime.
            isWorkletFunction: () => false,
            WorkletsModule: {},
          };
          api.default = api;
          return api;
        },
      },
    },
  };
}

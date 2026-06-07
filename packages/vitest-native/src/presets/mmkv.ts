import type { Preset } from "../types.js";
import { useState } from "react";

// react-native-mmkv pulls react-native-nitro-modules, which throws at import
// without the native runtime. Shadow it with an in-memory implementation so the
// MMKV API behaves (get/set round-trips) in tests.
export function mmkv(): Preset {
  return {
    name: "mmkv",
    modules: {
      "react-native-mmkv": {
        exports: [
          "MMKV",
          "createMMKV",
          "useMMKV",
          "useMMKVString",
          "useMMKVNumber",
          "useMMKVBoolean",
          "useMMKVObject",
          "useMMKVBuffer",
          "useMMKVListener",
          "Mode",
        ],
        factory: () => {
          class MMKV {
            _store = new Map<string, string | number | boolean | Uint8Array>();
            set(key: string, value: string | number | boolean | Uint8Array) {
              this._store.set(key, value);
            }
            getString(key: string) {
              const v = this._store.get(key);
              return typeof v === "string" ? v : undefined;
            }
            getNumber(key: string) {
              const v = this._store.get(key);
              return typeof v === "number" ? v : undefined;
            }
            getBoolean(key: string) {
              const v = this._store.get(key);
              return typeof v === "boolean" ? v : undefined;
            }
            getBuffer(key: string) {
              const v = this._store.get(key);
              return v instanceof Uint8Array ? v : undefined;
            }
            contains(key: string) {
              return this._store.has(key);
            }
            delete(key: string) {
              this._store.delete(key);
            }
            getAllKeys() {
              return [...this._store.keys()];
            }
            clearAll() {
              this._store.clear();
            }
            recrypt() {}
            addOnValueChangedListener() {
              return { remove() {} };
            }
          }

          const shared = new MMKV();
          const createMMKV = () => new MMKV();
          const useMMKV = () => shared;

          function makeHook<T>(get: (m: MMKV, k: string) => T | undefined) {
            return (key: string, instance?: MMKV) => {
              const m = instance ?? shared;
              const [value, setValue] = useState<T | undefined>(get(m, key));
              const set = (v: T | undefined) => {
                if (v === undefined) m.delete(key);
                else m.set(key, v as any);
                setValue(v);
              };
              return [value, set] as const;
            };
          }

          return {
            __esModule: true,
            MMKV,
            createMMKV,
            useMMKV,
            useMMKVString: makeHook((m, k) => m.getString(k)),
            useMMKVNumber: makeHook((m, k) => m.getNumber(k)),
            useMMKVBoolean: makeHook((m, k) => m.getBoolean(k)),
            useMMKVBuffer: makeHook((m, k) => m.getBuffer(k)),
            useMMKVObject: (key: string, instance?: MMKV) => {
              const m = instance ?? shared;
              const raw = m.getString(key);
              const [value, setValue] = useState<any>(raw ? JSON.parse(raw) : undefined);
              const set = (v: any) => {
                if (v === undefined) m.delete(key);
                else m.set(key, JSON.stringify(v));
                setValue(v);
              };
              return [value, set] as const;
            },
            useMMKVListener: () => ({ remove() {} }),
            Mode: { SINGLE_PROCESS: 0, MULTI_PROCESS: 1 },
          };
        },
      },
    },
  };
}

import type { Preset } from "../types.js";
import { vi } from "vitest";

export function asyncStorage(): Preset {
  return {
    name: "asyncStorage",
    modules: {
      "@react-native-async-storage/async-storage": {
        exports: [
          "getItem",
          "setItem",
          "removeItem",
          "mergeItem",
          "clear",
          "getAllKeys",
          "multiGet",
          "multiSet",
          "multiRemove",
          "multiMerge",
          "flushGetRequests",
        ],
        factory: () => {
          const store = new Map<string, string>();

          const getItem = vi.fn(async (key: string): Promise<string | null> => {
            return store.get(key) ?? null;
          });

          const setItem = vi.fn(async (key: string, value: string): Promise<void> => {
            store.set(key, value);
          });

          const removeItem = vi.fn(async (key: string): Promise<void> => {
            store.delete(key);
          });

          const mergeItem = vi.fn(async (key: string, value: string): Promise<void> => {
            const existing = store.get(key);
            if (existing) {
              try {
                const merged = { ...JSON.parse(existing), ...JSON.parse(value) };
                store.set(key, JSON.stringify(merged));
              } catch {
                store.set(key, value);
              }
            } else {
              store.set(key, value);
            }
          });

          const clear = vi.fn(async (): Promise<void> => {
            store.clear();
          });

          const getAllKeys = vi.fn(async (): Promise<string[]> => {
            return Array.from(store.keys());
          });

          const multiGet = vi.fn(async (keys: string[]): Promise<[string, string | null][]> => {
            return keys.map((key) => [key, store.get(key) ?? null]);
          });

          const multiSet = vi.fn(async (keyValuePairs: [string, string][]): Promise<void> => {
            keyValuePairs.forEach(([key, value]) => store.set(key, value));
          });

          const multiRemove = vi.fn(async (keys: string[]): Promise<void> => {
            keys.forEach((key) => store.delete(key));
          });

          const multiMerge = vi.fn(async (keyValuePairs: [string, string][]): Promise<void> => {
            keyValuePairs.forEach(([key, value]) => {
              const existing = store.get(key);
              if (existing) {
                try {
                  const merged = { ...JSON.parse(existing), ...JSON.parse(value) };
                  store.set(key, JSON.stringify(merged));
                } catch {
                  store.set(key, value);
                }
              } else {
                store.set(key, value);
              }
            });
          });

          const flushGetRequests = vi.fn((): void => {});

          const exports = {
            getItem,
            setItem,
            removeItem,
            mergeItem,
            clear,
            getAllKeys,
            multiGet,
            multiSet,
            multiRemove,
            multiMerge,
            flushGetRequests,
            /** Internal: reset store between tests. Called by resetAllMocks(). */
            _resetStore: () => store.clear(),
          };

          return {
            ...exports,
            default: exports,
          };
        },
      },
    },
  };
}

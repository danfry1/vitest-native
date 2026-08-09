import type { Preset } from "../types.js";
import { vi } from "vitest";

/**
 * The state every fetch/listener resolves to until a test changes it.
 *
 * Derived from ONE constant so `_reset()` and the initial value cannot drift — the
 * failure mode where `beforeEach(_reset())` masks the default it claims to test.
 *
 * The real library starts at `{ type: 'unknown', isConnected: null, … }` and resolves
 * to the device's actual connection a moment later. A mock has no device, and a null
 * resting state would send every component under test down its offline branch, so the
 * resting state here is a connected wifi device — the same reasoning that gives
 * Dimensions a device-shaped default.
 */
const RESTING = {
  type: "wifi",
  isConnected: true,
  isInternetReachable: true,
  details: {
    isConnectionExpensive: false,
    ssid: null,
    bssid: null,
    strength: null,
    ipAddress: null,
    subnet: null,
    frequency: null,
    linkSpeed: null,
    rxLinkSpeed: null,
    txLinkSpeed: null,
  },
} as const;

const state = () => structuredClone(RESTING) as Record<string, unknown>;

export function netInfo(): Preset {
  return {
    name: "netInfo",
    modules: {
      "@react-native-community/netinfo": {
        // Exactly the runtime surface: the six functions the entry exports, plus the
        // two enums re-exported through `export * from './internal/types'`. The rest
        // of that module is types, which have no runtime binding — declaring one
        // would make a value import of a type resolve here and fail under Metro.
        exports: [
          "configure",
          "fetch",
          "refresh",
          "addEventListener",
          "useNetInfo",
          "useNetInfoInstance",
          "NetInfoStateType",
          "NetInfoCellularGeneration",
        ],
        factory: () => {
          let current = state();
          const listeners = new Set<(s: unknown) => void>();

          const emit = (): void => {
            for (const listener of listeners) listener(current);
          };

          const fetch = vi.fn(async () => current);
          const refresh = vi.fn(async () => current);
          const configure = vi.fn(() => {
            // The real configure() drops existing listeners; mirroring that keeps a
            // test that configures mid-run from seeing stale subscriptions fire.
            listeners.clear();
          });

          const addEventListener = vi.fn((listener: (s: unknown) => void) => {
            listeners.add(listener);
            // The real implementation calls back with the latest state soon after
            // subscribing, which is what components rely on to render connected.
            listener(current);
            return () => {
              listeners.delete(listener);
            };
          });

          const useNetInfo = vi.fn(() => current);
          const useNetInfoInstance = vi.fn(() => ({ netInfo: current, refresh }));

          const NetInfoStateType = {
            unknown: "unknown",
            none: "none",
            cellular: "cellular",
            wifi: "wifi",
            bluetooth: "bluetooth",
            ethernet: "ethernet",
            wimax: "wimax",
            vpn: "vpn",
            other: "other",
          };

          const NetInfoCellularGeneration = { "2g": "2g", "3g": "3g", "4g": "4g", "5g": "5g" };

          const api = {
            configure,
            fetch,
            refresh,
            addEventListener,
            useNetInfo,
            useNetInfoInstance,
          };

          return {
            ...api,
            NetInfoStateType,
            NetInfoCellularGeneration,
            default: api,
            /** Drive the connection state from a test. */
            _setState: (next: Record<string, unknown>) => {
              current = { ...current, ...next };
              emit();
            },
            /** Internal: restore the resting state. Called by resetAllMocks(). */
            _reset: () => {
              current = state();
              listeners.clear();
            },
          };
        },
      },
    },
  };
}

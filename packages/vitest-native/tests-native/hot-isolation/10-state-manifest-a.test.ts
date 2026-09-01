import { Dimensions } from "react-native";
import { afterAll, expect, it, vi } from "vitest";

const processEvent = "vn-hot-state-manifest-audit";
const globals = globalThis as typeof globalThis & {
  ErrorUtils?: {
    getGlobalHandler(): unknown;
    setGlobalHandler(handler: (error: unknown, fatal: boolean) => void): void;
  };
  expo?: {
    modules: Record<
      string,
      { addListener(name: string, fn: () => void): unknown; listenerCount(name: string): number }
    >;
  };
};
const expoEvent = "changed";
const expoModule = globals.expo?.modules.VNHotStateManifest;

const inherited = {
  processListeners: process.listenerCount(processEvent),
  fetchName: globalThis.fetch?.name,
  consoleWarnName: console.warn.name,
  errorHandlerName: (globals.ErrorUtils?.getGlobalHandler() as Function | undefined)?.name,
  expoListeners: expoModule?.listenerCount(expoEvent) ?? 0,
  windowWidth: Dimensions.get("window").width,
  fakeTimers: vi.isFakeTimers(),
};

process.on(processEvent, () => {});
globalThis.fetch = function vnHotMutatedFetch() {
  return Promise.reject(new Error("state-manifest probe only"));
} as typeof fetch;
globals.ErrorUtils?.setGlobalHandler(function vnHotMutatedErrorHandler() {});
expoModule?.addListener(expoEvent, () => {});
Dimensions.set({
  window: { ...Dimensions.get("window"), width: 9999 },
  screen: { ...Dimensions.get("screen"), width: 9999 },
});

it("inherits no shared-realm state from another file", () => {
  expect(inherited).toMatchObject({
    processListeners: 0,
    expoListeners: 0,
    fakeTimers: false,
  });
  expect(inherited.fetchName).not.toBe("vnHotMutatedFetch");
  expect(inherited.consoleWarnName).not.toBe("vnHotMutatedConsoleWarn");
  expect(inherited.errorHandlerName).not.toBe("vnHotMutatedErrorHandler");
  expect(inherited.windowWidth).not.toBe(9999);
});

afterAll(() => {
  console.warn = function vnHotMutatedConsoleWarn() {};
  vi.useFakeTimers();
});

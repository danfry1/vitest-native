/**
 * NetInfo is detected and inlined correctly without a preset — the failure it had was
 * at the native-module boundary. The generic stub answers any method with `undefined`,
 * NetInfo does `const state = await RNCNetInfo.getCurrentState(...)` and then reads
 * `state.isInternetReachable`, and the run died on a TypeError plus an unhandled
 * rejection that Vitest warns can produce false positives elsewhere.
 *
 * No generic stub can infer that shape, so this is the case that earns a preset.
 *
 * The wiring is asserted as well as the factory. Preset tests here have called
 * factories directly and never exercised AUTO_DETECT_PRESETS, which is how a preset
 * once shipped mapped to a name that shadowed nothing.
 */
import { describe, expect, it } from "vitest";
import { AUTO_DETECT_PRESETS } from "../src/preset-map.js";
import * as presets from "../src/presets/index.js";
import { netInfo } from "../src/presets/netinfo.js";

const PACKAGE = "@react-native-community/netinfo";

/** The module object a worker would get for the shadowed package. */
function moduleFor(): Record<string, any> {
  const preset = netInfo();
  return preset.modules[PACKAGE].factory();
}

describe("netInfo preset: wiring", () => {
  it("is auto-detected for the package it shadows", () => {
    expect(AUTO_DETECT_PRESETS[PACKAGE]).toBe("netInfo");
  });

  it("is reachable under the name auto-detection resolves", () => {
    // The gap this closes: a map entry naming an export that does not exist means
    // detection finds the package and then shadows nothing.
    const exportName = AUTO_DETECT_PRESETS[PACKAGE];
    expect(typeof (presets as Record<string, unknown>)[exportName]).toBe("function");
  });

  it("shadows exactly the package it claims", () => {
    expect(Object.keys(netInfo().modules)).toEqual([PACKAGE]);
  });
});

describe("netInfo preset: state", () => {
  it("resolves a connected state before anything resets it", async () => {
    // Asserted on a FRESH factory with no _reset() first: a beforeEach(_reset())
    // would otherwise be asserting what _reset does, not what the default is.
    const m = moduleFor();
    const state = await m.fetch();
    expect(state.isConnected).toBe(true);
    expect(state.isInternetReachable).toBe(true);
    expect(state.type).toBe("wifi");
  });

  it("gives refresh the same shape as fetch", async () => {
    const m = moduleFor();
    expect(await m.refresh()).toEqual(await m.fetch());
  });

  it("lets a test drive the connection state", async () => {
    const m = moduleFor();
    m._setState({ isConnected: false, isInternetReachable: false, type: "none" });
    const state = await m.fetch();
    expect(state.isConnected).toBe(false);
    expect(state.type).toBe("none");
  });

  it("restores the resting state on _reset", async () => {
    const m = moduleFor();
    m._setState({ isConnected: false, type: "none" });
    m._reset();
    const state = await m.fetch();
    expect(state.isConnected).toBe(true);
    expect(state.type).toBe("wifi");
  });

  it("does not leak state between factories", async () => {
    const first = moduleFor();
    first._setState({ isConnected: false });
    expect((await moduleFor().fetch()).isConnected).toBe(true);
  });
});

describe("netInfo preset: listeners", () => {
  it("calls a new listener with the current state", () => {
    const m = moduleFor();
    const seen: unknown[] = [];
    m.addEventListener((s: unknown) => seen.push(s));
    // The real implementation calls back soon after subscribing; components rely on
    // it to render connected rather than waiting for a change that never comes.
    expect(seen).toHaveLength(1);
    expect((seen[0] as { isConnected: boolean }).isConnected).toBe(true);
  });

  it("notifies listeners when the state changes", () => {
    const m = moduleFor();
    const seen: unknown[] = [];
    m.addEventListener((s: unknown) => seen.push(s));
    m._setState({ isConnected: false });
    expect(seen).toHaveLength(2);
    expect((seen[1] as { isConnected: boolean }).isConnected).toBe(false);
  });

  it("stops notifying after unsubscribe", () => {
    const m = moduleFor();
    const seen: unknown[] = [];
    const unsubscribe = m.addEventListener((s: unknown) => seen.push(s));
    unsubscribe();
    m._setState({ isConnected: false });
    expect(seen).toHaveLength(1);
  });

  it("drops listeners on configure, as the real library does", () => {
    const m = moduleFor();
    const seen: unknown[] = [];
    m.addEventListener((s: unknown) => seen.push(s));
    m.configure({});
    m._setState({ isConnected: false });
    expect(seen).toHaveLength(1);
  });
});

describe("netInfo preset: hooks and enums", () => {
  it("returns the current state from useNetInfo", () => {
    const m = moduleFor();
    m._setState({ type: "cellular" });
    expect(m.useNetInfo().type).toBe("cellular");
  });

  it("returns state and refresh from useNetInfoInstance", async () => {
    const m = moduleFor();
    const instance = m.useNetInfoInstance();
    expect(instance.netInfo.isConnected).toBe(true);
    expect(await instance.refresh()).toBeDefined();
  });

  it("exposes the enums as runtime values", () => {
    // These are TypeScript enums re-exported through `export * from './internal/types'`,
    // so unlike the rest of that module they DO have runtime bindings.
    const m = moduleFor();
    expect(m.NetInfoStateType.wifi).toBe("wifi");
    expect(m.NetInfoStateType.none).toBe("none");
    expect(m.NetInfoCellularGeneration["4g"]).toBe("4g");
  });

  it("exposes the same api on the default export", () => {
    const m = moduleFor();
    expect(typeof m.default.fetch).toBe("function");
    expect(typeof m.default.addEventListener).toBe("function");
  });
});

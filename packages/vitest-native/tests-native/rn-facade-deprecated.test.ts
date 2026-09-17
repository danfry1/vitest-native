// Regression: importing any name from 'react-native' printed the deprecation notice
// of every deprecated member (SafeAreaView, Clipboard, PushNotificationIOS, …).
//
// React Native prints those notices from the members' getters, and the facade read
// every getter while it initialised. The facade now leaves deprecated members as
// getters, so a notice appears only where a test really uses the member.
//
// React Native's `warnOnce` prints once per process, so watching the console is
// order-dependent. Instead, every getter on the real index is wrapped before the
// facade loads (vi.hoisted runs ahead of the imports) and the reads are recorded.
import { afterAll, describe, expect, it, vi } from "vitest";

const probe = await vi.hoisted(async () => {
  const { createRequire } = await import("node:module");
  const rn = createRequire(import.meta.url)("react-native");
  const reads = new Set<string>();
  const deprecated: string[] = [];
  const originals = new Map<string, PropertyDescriptor>();
  for (const [name, descriptor] of Object.entries(Object.getOwnPropertyDescriptors(rn))) {
    const get = descriptor.get;
    if (!get || !descriptor.configurable) continue;
    if (/\bwarnOnce\b/.test(String(get))) deprecated.push(name);
    originals.set(name, descriptor);
    Object.defineProperty(rn, name, {
      ...descriptor,
      get() {
        reads.add(name);
        return get.call(this);
      },
    });
  }
  const restore = () => {
    for (const [name, descriptor] of originals) Object.defineProperty(rn, name, descriptor);
  };
  return { reads, deprecated, restore };
});

import * as RN from "react-native";
import { Pressable } from "react-native";

afterAll(() => probe.restore());

describe("react-native facade and deprecated members", () => {
  it("does not read deprecated members when the module is imported", () => {
    expect(Pressable).toBeDefined();
    expect(probe.deprecated.length).toBeGreaterThan(0);
    expect(probe.deprecated.filter((name) => probe.reads.has(name))).toEqual([]);
  });

  it("still exposes deprecated members, reading them on use", () => {
    const name = probe.deprecated[0];
    expect(Object.keys(RN)).toContain(name);
    expect((RN as Record<string, unknown>)[name]).toBeDefined();
    expect(probe.reads.has(name)).toBe(true);
  });
});

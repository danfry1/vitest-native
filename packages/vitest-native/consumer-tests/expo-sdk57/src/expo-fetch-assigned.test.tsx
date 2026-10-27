// Its own file, so the import below is the first time Expo loads in it: a module
// already loaded by an earlier test would not run Expo's runtime again, and the
// check would pass however the runtime was installed.
import { expect, it, vi } from "vitest";

it("keeps a fetch the project assigned before expo loads", async () => {
  const original = globalThis.fetch;
  globalThis.fetch = vi.fn(async () => new Response("assigned")) as typeof fetch;
  try {
    await import("expo");
    expect(await (await fetch("https://example.test/")).text()).toBe("assigned");
  } finally {
    globalThis.fetch = original;
  }
});

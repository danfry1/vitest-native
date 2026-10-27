/**
 * Expo's runtime installs its web globals before a project's setup files, as under
 * jest-expo, and leaves global `fetch` as Node's. It used to install them at the
 * first `expo` import, after the setup files, replacing a `fetch` mocked there; and
 * Expo's own fetch, driven by a native module, bypasses Node's HTTP stack, where MSW
 * intercepts. Either way the request failed with "request.start is not a function".
 */
import { expect, it } from "vitest";

it("serves MSW's handler after importing expo", async () => {
  await import("expo");
  const response = await fetch("https://api.example.test/greeting");
  expect(await response.json()).toEqual({ hello: "msw" });
});

it("reaches Node's fetch for a request no handler matches", async () => {
  await import("expo");
  const response = await fetch("data:text/plain,from%20node");
  expect(await response.text()).toBe("from node");
});

it("leaves Node's FormData working after importing expo", async () => {
  await import("expo");
  const form = new FormData();
  form.append("field", "value");
  form.set("other", "1");
  expect([...form.entries()]).toEqual([
    ["field", "value"],
    ["other", "1"],
  ]);
});

it("does not leave Expo's fetch switch set for the project's code", () => {
  // Set only while the runtime loads (see installExpoRuntime in the engine).
  expect(process.env.EXPO_PUBLIC_USE_RN_FETCH).toBeUndefined();
});

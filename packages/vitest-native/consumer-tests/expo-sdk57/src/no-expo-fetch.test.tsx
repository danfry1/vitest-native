// An Expo project's test file that never imports Expo: its runtime is installed for
// every file, so MSW must keep working here too.
import { expect, it } from "vitest";

it("serves MSW's handler in a file that never imports expo", async () => {
  const response = await fetch("https://api.example.test/greeting");
  expect(await response.json()).toEqual({ hello: "msw" });
});

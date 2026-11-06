// pnpm names this library's store directory after its reanimated peer.
import { expect, test } from "vitest";
import { platform } from "museum-peer-lib";

test("a library beside reanimated in the store resolves its .native file", () => {
  expect(platform).toBe("native");
});

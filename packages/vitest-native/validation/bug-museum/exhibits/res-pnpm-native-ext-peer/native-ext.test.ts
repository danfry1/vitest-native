// pnpm names this library's store directory after its worklets peer.
import { expect, test } from "vitest";
import { platform } from "museum-peer-lib";

test("a library beside worklets in the store resolves its .native file", () => {
  expect(platform).toBe("native");
});

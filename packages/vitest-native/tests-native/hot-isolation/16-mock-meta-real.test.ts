import { expect, it } from "vitest";
import { owner } from "./mock-meta-z";

// See mock-meta-z.ts. Meaningful when it runs after 14-mock-meta-a or 15-mock-meta-b.
it("gets the real module when it does not mock it", () => {
  expect(owner()).toBe("real-z");
});

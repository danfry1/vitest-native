/** A __mocks__ redirect is served to Node as the module Vitest evaluated for it (R3). */
import { expect, it, vi } from "vitest";
import * as redirected from "dispatch-redirect-lib";
import { requireFrom } from "dispatch-consumer-lib";

vi.mock("dispatch-redirect-lib");

it("serves the __mocks__ module", () => {
  expect(redirected.source).toBe("__mocks__");
  expect(requireFrom("dispatch-redirect-lib").source).toBe("__mocks__");
});

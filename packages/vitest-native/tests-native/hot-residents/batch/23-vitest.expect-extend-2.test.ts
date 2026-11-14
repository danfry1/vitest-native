import { expect, test } from "vitest";
import { observe } from "../audit";

test("observes", () => {
  let matcher = "missing";
  try {
    (expect(1) as unknown as { toBeVnAudit(): void }).toBeVnAudit();
    matcher = "present";
  } catch {}
  observe("vitest.expect-extend", { matcher });
});

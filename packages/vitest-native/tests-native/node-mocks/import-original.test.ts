/**
 * Vitest's own loads of a module's original (importOriginal, vi.importActual) get the
 * original (R1), and the partial mock built from it is what Node's consumers get.
 */
import { expect, it, vi } from "vitest";
import * as target from "dispatch-target-lib";
import { importFrom, requireFrom } from "dispatch-consumer-lib";

vi.mock("dispatch-target-lib", async (importOriginal) => ({
  ...(await importOriginal<object>()),
  source: "partial",
}));

it("builds the partial mock from the original", () => {
  expect(target.source).toBe("partial");
  expect((target as unknown as { kind: string }).kind).toBe("top");
});

it("gives vi.importActual the original", async () => {
  const actual = await vi.importActual<{ source: string }>("dispatch-target-lib");
  expect(actual.source).toBe("real");
});

it("serves the partial mock to an installed package's require and import", async () => {
  expect(requireFrom("dispatch-target-lib").source).toBe("partial");
  expect(requireFrom("dispatch-target-lib").kind).toBe("top");
  const consumer = (await importFrom("dispatch-consumer-lib/esm-consumer.mjs")) as {
    seen: string;
  };
  expect(consumer.seen).toBe("partial");
});

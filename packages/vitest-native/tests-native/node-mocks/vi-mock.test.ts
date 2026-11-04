/**
 * experimental.nodeMocks: a `vi.mock` factory applies to an installed package's own
 * require and import of the mocked module, as a `jest.mock` factory does under Jest
 * (#322). dispatch-consumer-lib is installed, so Node loads it, and it requires or
 * imports dispatch-target-lib by name.
 */
import { expect, it, vi } from "vitest";
import * as target from "dispatch-target-lib";
import { importFrom, requireFrom } from "dispatch-consumer-lib";
import { Platform } from "react-native";

vi.mock("dispatch-target-lib", () => ({ source: "vi.mock" }));

it("reaches an installed package's require", () => {
  expect(requireFrom("dispatch-target-lib").source).toBe("vi.mock");
});

it("reaches an installed ES module's import", async () => {
  const { seen } = (await importFrom("dispatch-consumer-lib/esm-consumer.mjs")) as {
    seen: string;
  };
  expect(seen).toBe("vi.mock");
});

it("is the instance the test imports", () => {
  expect(target.source).toBe("vi.mock");
  const required = requireFrom("dispatch-target-lib");
  expect(requireFrom("dispatch-target-lib")).toBe(required);
});

it("leaves the modules the test does not mock alone: react-native is the test's", () => {
  expect(requireFrom("react-native").Platform).toBe(Platform);
});

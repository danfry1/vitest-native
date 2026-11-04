// #322's shape: vi.mock of a package that an installed (Node-owned) package imports itself.
import { expect, test, vi } from "vitest";
import { createURL } from "museum-linking";

vi.mock("museum-constants", () => ({ expoConfig: { scheme: "mocked" } }));

test("a vi.mock factory applies to an installed package's own import", () => {
  expect(createURL("home"), "museum-linking reads the mocked museum-constants").toBe(
    "mocked://home",
  );
});

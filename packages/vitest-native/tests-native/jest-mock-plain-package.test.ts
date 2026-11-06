/**
 * A package without a react-native field: its mocked file is its `main`, the file Jest
 * mocks too, so the package's own relative require of it gets the mock, as under Jest.
 */
import { expect, it } from "vitest";

declare const jest: { mock(path: string, factory: () => unknown): void };

jest.mock("vn-lib-plain-mock", () => ({ source: "jest.mock" }));

it("serves the mock to the package's relative require of its main", () => {
  expect(require("vn-lib-plain-mock/feature")().source).toBe("jest.mock");
});

import React from "react";
import { render, screen } from "@testing-library/react-native";
import { expect, test } from "vitest";
import { Widget } from "@/widget.js";
// Imported through the same alias but deliberately NOT mocked. The mocked import
// above cannot prove the alias works: jest.mock short-circuits resolution of that
// specifier, so dropping the generated resolve.alias entirely still passed until this
// module was added.
import { APP_NAME } from "@/constants.js";

// Everything here comes from the config `vitest-native migrate --write` generated
// from this project's jest.config.json: the setup file (declared with <rootDir>),
// the alias derived from moduleNameMapper, and the jest.mock rewrite.
jest.mock("@/widget.js", () => ({ Widget: () => null }));

test("the jest setup file declared with <rootDir> ran", () => {
  expect(globalThis.__JEST_SETUP_RAN__).toBe(true);
});

test("the moduleNameMapper alias resolves an unmocked module", () => {
  expect(APP_NAME).toBe("migrated-app");
});

test("jest.mock intercepts a module imported through that alias", () => {
  render(<Widget />);
  expect(screen.queryByTestId("widget")).toBeNull();
});

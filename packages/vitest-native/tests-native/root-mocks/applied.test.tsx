// Jest's manual mocks of node_modules packages apply with no jest.mock() call.
import React from "react";
import path from "node:path";
import { render, screen } from "@testing-library/react-native";
import { origin } from "ext-rn-named-lib";
import { entry as deepEntry } from "generic-mainfield-lib";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { entry as indexEntry } from "rn-mainfield-lib";
import * as singleton from "rn-singleton-lib";
import { build } from "vn-lib-two-entries";
import { entry as setupEntry } from "vn-lib-plain-two-entries";
import { source } from "vn-lib-plain-mock";
import { count } from "resident-singleton";
import { Greeting } from "./app/Greeting";

test("an app module's import of a React Native package gets the root mock", async () => {
  await render(<Greeting name="Ada" />);
  expect(screen.getByTestId("banner")).toHaveTextContent("mocked Ada");
});

test("a plain package gets the root mock, through import and through require()", () => {
  expect(count()).toBe(-1);
  expect(require("resident-singleton").count()).toBe(-1);
});

test("a root mock of a package only ever required reaches require()", () => {
  expect(require("rn-condition-cjs-lib").source).toBe("the manual mock, through require");
});

test("a manual mock that requires its own package gets the real module", async () => {
  const lib = await import("dispatch-target-lib");
  expect(lib.source).toBe("the mock over the real module");
  expect(lib.kind).toBe("top");
});

test("the setup file got the mock too", () => {
  expect((globalThis as Record<string, unknown>).__setupCount).toBe(-1);
});

test("a mock in a second root applies", () => {
  expect(source).toBe("mocked-from-other-root");
});

test("a TypeScript mock in a root outside the Vite root applies", () => {
  expect(origin).toBe("mocked-outside-root");
});

test("a __mocks__ folder at any depth counts", () => {
  expect(deepEntry).toBe("mocked-deep");
});

test("__mocks__/<name>/index answers <name>", () => {
  expect(indexEntry).toBe("mocked-index");
});

test("of two files with one name, the one read last applies", () => {
  expect(build).toBe("mocked-last");
});

test("a setup file's jest.mock(name, factory) wins over the manual mock", () => {
  expect(setupEntry).toBe("setup-factory");
});

test("a setup file's jest.unmock(name) wins over the manual mock", () => {
  expect("mocked" in singleton).toBe(false);
  expect(typeof singleton.configure).toBe("function");
});

test("a Node core module is not mocked without jest.mock()", () => {
  expect(path.join("a", "b")).toBe(`a${path.sep}b`);
});

test("a package a preset stands in for keeps the preset", async () => {
  let top: number | undefined;
  function Probe() {
    top = useSafeAreaInsets().top;
    return null;
  }
  await render(<Probe />);
  expect(top).toBeTypeOf("number");
  expect(top).not.toBe(-1);
});

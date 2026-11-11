// The library's parts, imported as a namespace as its documentation shows, render.
import * as React from "react";
import { render, screen } from "@testing-library/react-native";
import { expect, test } from "vitest";
import * as Badge from "museum-badge";

// The bug's condition: the import is the library's ES build, which the engine compiles.
test("the import resolves to the library's ES build", () => {
  expect(import.meta.resolve("museum-badge")).toMatch(/\/build\/index\.mjs$/);
});

test("the namespace carries the library's parts", () => {
  expect(typeof Badge.Root, "Badge.Root").toBe("function");
});

test("<Badge.Root> renders", async () => {
  await render(
    <Badge.Root>
      <Badge.Label>new</Badge.Label>
    </Badge.Root>,
  );
  expect(screen.getByText("new")).toBeTruthy();
});

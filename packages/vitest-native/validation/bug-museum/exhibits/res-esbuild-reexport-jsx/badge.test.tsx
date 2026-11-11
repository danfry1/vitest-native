// The library's parts, imported as a namespace as its documentation shows, render.
import * as React from "react";
import { render, screen } from "@testing-library/react-native";
import { expect, test } from "vitest";
import * as Badge from "museum-badge";

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

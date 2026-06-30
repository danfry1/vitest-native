import { expect, test } from "vitest";
import { render, screen } from "@testing-library/react-native";
import * as React from "react";
import { Crashy, ErrorBoundary } from "./app/ErrorBoundary.js";

test("error boundary renders children when they do not throw", async () => {
  await render(
    <ErrorBoundary>
      <Crashy crash={false} />
    </ErrorBoundary>,
  );
  expect(screen.getByTestId("ok")).toBeOnTheScreen();
});

test("error boundary catches a throwing child and shows the fallback", async () => {
  await render(
    <ErrorBoundary>
      <Crashy crash />
    </ErrorBoundary>,
  );
  expect(screen.getByTestId("boundary")).toHaveTextContent("Something went wrong");
  expect(screen.queryByTestId("ok")).toBeNull();
});

// A later file with the same setup file. Under the hot runtime RNTL stays loaded from
// the previous file, so it does not switch timers again; this file's fake timers are
// the setup file's own.
import React from "react";
import { render, screen, waitFor } from "@testing-library/react-native";
import { expect, test, vi } from "vitest";
import { Delayed } from "../rntl-timers/delayed";

test("fake timers are still on after RNTL loads", () => {
  expect(vi.isFakeTimers()).toBe(true);
});

test("findBy* advances the setup file's fake timers", async () => {
  await render(<Delayed ms={300} />);
  expect(await screen.findByText("ready")).toBeTruthy();
});

test("waitFor advances the setup file's fake timers", async () => {
  await render(<Delayed ms={500} />);
  await waitFor(() => expect(screen.getByText("ready")).toBeTruthy());
});

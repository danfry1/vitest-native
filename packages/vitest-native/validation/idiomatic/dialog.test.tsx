import { expect, test, vi } from "vitest";
import { fireEvent, render, screen, userEvent } from "@testing-library/react-native";
import * as React from "react";
import { Dialog } from "./Dialog.js";

test("backdrop press fires onDismiss (fireEvent)", async () => {
  const onDismiss = vi.fn();
  await render(
    <Dialog visible onDismiss={onDismiss}>
      <></>
    </Dialog>,
  );
  await fireEvent.press(screen.getByTestId("backdrop"));
  expect(onDismiss).toHaveBeenCalledTimes(1);
});

test("backdrop press fires onDismiss (userEvent)", async () => {
  const user = userEvent.setup();
  const onDismiss = vi.fn();
  await render(
    <Dialog visible onDismiss={onDismiss}>
      <></>
    </Dialog>,
  );
  await user.press(screen.getByTestId("backdrop"));
  expect(onDismiss).toHaveBeenCalledTimes(1);
});

test("hidden dialog does not expose its body", async () => {
  await render(
    <Dialog visible={false} onDismiss={() => {}}>
      <></>
    </Dialog>,
  );
  expect(screen.queryByTestId("dialog-body")).toBeNull();
});

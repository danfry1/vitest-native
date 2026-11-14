import React from "react";
import { Text } from "react-native";
import { render, screen } from "@testing-library/react-native";
import { test } from "vitest";
import { observe } from "../audit";

test("observes", async () => {
  await render(<Text style={{ display: "none" }}>hidden</Text>);
  observe("rntl.configure", { findsHidden: screen.queryByText("hidden") !== null });
});

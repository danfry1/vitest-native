import React from "react";
import { Text } from "react-native";
import { render, screen } from "@testing-library/react-native";
import { test } from "vitest";
import { observe } from "../audit";

test("observes", async () => {
  await render(<Text>second</Text>);
  observe("react.act-scope", { committed: screen.queryByText("second") !== null });
});

// RNTL's documented opt-out shares one render across a file's tests. Under the hot
// runtime every file after the first on a worker found its tree unmounted after its
// first test (#527): the module's side effect ran in the first file only.
import "@testing-library/react-native/dont-cleanup-after-each";
import { render, screen } from "@testing-library/react-native";
import { Text } from "react-native";
import { beforeAll, expect, it } from "vitest";

beforeAll(async () => {
  await render(<Text>shared</Text>);
});

it("renders once for the file", () => {
  expect(screen.getByText("shared")).toBeTruthy();
});

it("keeps that render for the next test", () => {
  expect(screen.queryByText("shared"), "the opt-out kept the tree mounted").not.toBeNull();
});

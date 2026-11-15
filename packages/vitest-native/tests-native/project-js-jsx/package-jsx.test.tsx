// A package the native engine does not detect, with JSX in a `.js` file (#763): Vite
// serves it uncompiled, and it renders with no configuration. Its plain file is served as
// published, and a project's transform plugin still runs on the compiled file.
import { render, screen } from "@testing-library/react-native";
import { Label, marker, plain } from "jsx-in-js-lib";
import { expect, it } from "vitest";

it("renders JSX from a package's .js file that nothing compiles", async () => {
  await render(<Label>from the package</Label>);
  expect(screen.getByTestId("label").props.children).toBe("from the package");
});

it("serves the package's plain file as published", () => {
  expect(plain).toBe("plain");
});

it("runs a project's transform plugin on the compiled file", () => {
  expect(marker).toBe("applied");
});

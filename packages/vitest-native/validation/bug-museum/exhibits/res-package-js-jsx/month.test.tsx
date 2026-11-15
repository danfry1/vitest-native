import { render, screen } from "@testing-library/react-native";
import { Month } from "calendar-shaped-lib";
import { expect, it } from "vitest";

it("renders a component from a package with JSX in a .js file, with no configuration", async () => {
  await render(<Month title="November 2026" />);
  expect(screen.getByTestId("month").props.children).toBe("November 2026");
});

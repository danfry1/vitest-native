import { render, screen } from "@testing-library/react-native";
import { expect, it } from "vitest";
import { Card, CardView } from "./src/Card";

it("compiles a plain project with Oxc only", async () => {
  await render(<CardView label="hello" />);
  expect(screen.getByText("hello")).toBeTruthy();
  expect(Card.title).toBe("card");
});

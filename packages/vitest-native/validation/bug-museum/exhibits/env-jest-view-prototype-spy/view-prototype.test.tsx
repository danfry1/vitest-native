import React from "react";
import { View } from "react-native";
import { render } from "@testing-library/react-native";

test("jest.spyOn(View.prototype, 'measure') reaches a View ref", async () => {
  let outcome: string;
  try {
    jest
      .spyOn(View.prototype as unknown as { measure: (cb: Function) => void }, "measure")
      .mockImplementation((callback: Function) => callback(0, 0, 100, 50, 0, 0));
    const ref = React.createRef<View>();
    await render(<View ref={ref} />);
    let width = -1;
    ref.current!.measure((_x, _y, w) => {
      width = w;
    });
    outcome = width === 100 ? "measured through the spy" : `width ${width}`;
  } catch (error) {
    outcome = `throws: ${String((error as Error).message).split("\n")[0].slice(0, 80)}`;
  }
  expect(outcome, "a spy on View.prototype.measure").toBe("measured through the spy");
});

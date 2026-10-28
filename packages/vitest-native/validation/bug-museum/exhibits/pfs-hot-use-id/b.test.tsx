import React, { useId } from "react";
import { Text } from "react-native";
import { render, screen } from "@testing-library/react-native";

function Label() {
  const id = useId();
  return <Text testID="label" nativeID={id}>{id}</Text>;
}

// The same component, rendered first in a fresh file: under Jest (and stock
// isolation) every file sees the same first id, so a snapshot holding it is stable.
test("the first useId in a file is the same in every file", async () => {
  await render(<Label />);
  const id = screen.getByTestId("label").props.nativeID;
  console.log(`[leak:useid] ${expect.getState().testPath?.split("/").pop()} first id = ${id}`);
  expect(id).toBe("_r_0_");
});

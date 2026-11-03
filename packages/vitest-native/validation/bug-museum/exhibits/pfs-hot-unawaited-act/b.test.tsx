import React from "react";
import { Text } from "react-native";
import { render, screen } from "@testing-library/react-native";

// A correct file. It must not depend on what an earlier file did.
test("an ordinary render in the next file", async () => {
  await render(<Text>second file</Text>);
  console.log(`[leak:act] b.test.tsx toJSON = ${JSON.stringify(screen.toJSON())}`);
  expect(screen.toJSON(), "this file's render committed a tree").not.toBeNull();
  expect(screen.getByText("second file")).toBeTruthy();
});

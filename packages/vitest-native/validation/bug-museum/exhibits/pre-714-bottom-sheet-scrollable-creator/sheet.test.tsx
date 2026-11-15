// A list inside a sheet, rendered through the scrollable the package's
// useBottomSheetScrollableCreator makes, as its docs show for a custom list.
import React from "react";
import { FlatList, Text } from "react-native";
import { render, screen } from "@testing-library/react-native";
import { useBottomSheetScrollableCreator } from "@gorhom/bottom-sheet";
import { expect, test } from "vitest";

function Rows() {
  const renderScrollComponent = useBottomSheetScrollableCreator();
  return (
    <FlatList
      data={["first", "second"]}
      keyExtractor={(item) => item}
      renderItem={({ item }) => <Text>{item}</Text>}
      renderScrollComponent={renderScrollComponent}
    />
  );
}

test("a list in a sheet renders its rows", async () => {
  await render(<Rows />);
  expect(screen.getByText("second")).toBeTruthy();
});

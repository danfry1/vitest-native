// A package whose `react-native` field names a different implementation than `main`.
import { expect, test } from "vitest";
import { implementation } from "museum-rn-field";
import readImplementation from "museum-rn-field-reader";

test("the test's import takes the react-native field, as Metro does", () => {
  expect(implementation, "the import takes the react-native implementation").toBe("native");
});

test("an installed library's require takes the react-native field, as Metro does", () => {
  expect(readImplementation(), "a library's require takes the react-native implementation").toBe(
    "native",
  );
});

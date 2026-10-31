// StyleSheet.compose and flatten under the mock engine, held to React Native's own behaviour.
import { StyleSheet } from "react-native";
import { expect, test } from "vitest";

const b = { color: "red" };

test("compose with a nullish side returns the other side", () => {
  expect(StyleSheet.compose(null, b)).toBe(b);
  expect(StyleSheet.compose(b, undefined)).toBe(b);
});

test("flatten of an empty array is an empty object", () => {
  expect(StyleSheet.flatten([])).toEqual({});
});

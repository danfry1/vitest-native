import "@testing-library/react-native";
import { expect, it } from "vitest";

it("RNTL reinstalled the fake timers as it loaded in this file, dropping the set time", () => {
  expect(new Date().getUTCFullYear()).not.toBe(2001);
});

// Passes. Its act() callback rejects, which closes React's scope but leaves the act
// queue non-null until the next act() clears it: not an open scope.
import { act } from "@testing-library/react-native";
import { expect, it } from "vitest";

it("expects an act() callback to reject", async () => {
  await expect(
    act(async () => {
      throw new Error("expected");
    }),
  ).rejects.toThrow("expected");
});

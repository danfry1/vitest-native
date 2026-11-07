import { act } from "@testing-library/react-native";
import { expect, it } from "vitest";
import { files, see } from "./record";

it("the first file records its React, RNTL and useId", async () => {
  const seen = await see();
  expect(seen.esmReact).toBe(seen.cjsReact);
  files.push(seen);
});

it("leaves an act() scope open, as a test that forgets to await act() does", () => {
  // Never closes. With React resident, the next file's renders would queue inside it, and
  // the hot runtime refuses that file by name; with React fresh per file, it renders.
  void act(() => new Promise<void>(() => {}));
});

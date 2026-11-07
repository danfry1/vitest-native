// A file's own jest.unmock() wins over the root mock, as under Jest.
import { count } from "resident-singleton";

jest.unmock("resident-singleton");

test("the real package loads", () => {
  expect(count()).toBe(0);
});

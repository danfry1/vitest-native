import { source } from "museum-motion";

test("a root __mocks__ file replaces its node_modules package", () => {
  expect(source, "museum-motion, with __mocks__/museum-motion.js at the root").toBe("the manual mock");
});

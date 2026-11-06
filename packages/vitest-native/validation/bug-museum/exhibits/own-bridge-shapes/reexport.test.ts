// export * from an installed package, Node first: the names come through, and the import
// after it is the same module.
import { expect, test } from "vitest";
import { requireReexp } from "@m/feature";

test("export * from an installed package, required first", async () => {
  const required = requireReexp();
  const imported = await import("@m/validator/reexp");
  expect(typeof required.create, "the re-exported name, through require").toBe("function");
  expect(imported.create, "the same function through the import").toBe(required.create);
});

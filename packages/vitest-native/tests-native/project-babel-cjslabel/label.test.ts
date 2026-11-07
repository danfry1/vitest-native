import { expect, it } from "vitest";
import { label } from "./src/label";

it("keeps what the config's other plugin does", () => {
  expect(label).toBe("RIGHT");
});

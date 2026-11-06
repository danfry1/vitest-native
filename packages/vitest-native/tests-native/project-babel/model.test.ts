import { expect, it } from "vitest";
import Subscription from "./src/Model.js";
import { answer } from "./src/answer";

it("compiles legacy decorators with the project's Babel config", () => {
  const sub = new Subscription();
  sub.name = "general";
  expect((sub as unknown as { _raw: Record<string, string> })._raw.name).toBe("general");
  expect(Subscription.table).toBe("subscriptions");
});

it("applies the project's own plugin to a .ts file", () => {
  expect(answer).toBe(42);
});

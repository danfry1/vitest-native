// Imports a module that does not compile: the file must fail naming where.
import Subscription from "./Subscription.js";

it("is never reached", () => {
  expect(Subscription.table).toBe("subscriptions");
});

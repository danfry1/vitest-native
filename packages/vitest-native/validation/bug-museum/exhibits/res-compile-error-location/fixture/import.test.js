// Imports the model at the top, as a suite does: the file fails to load.
import Subscription from "./Subscription.js";

test("is never reached", () => {
  expect(Subscription.table).toBe("subscriptions");
});

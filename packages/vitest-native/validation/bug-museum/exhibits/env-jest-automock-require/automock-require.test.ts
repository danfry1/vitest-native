jest.mock("museum-analytics");

test("a factory-less jest.mock automocks the package for require() too", () => {
  const analytics = require("museum-analytics");
  expect(jest.isMockFunction(analytics.track), "museum-analytics, required").toBe(true);
});

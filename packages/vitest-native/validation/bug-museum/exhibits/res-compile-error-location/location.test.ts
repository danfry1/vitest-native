test("a module that does not compile fails naming its file and line", async () => {
  let message = "loaded";
  try {
    await import("./Subscription.js");
  } catch (error) {
    message = String((error as Error).message);
  }
  expect(
    /Subscription\.js:1[0-2]/.test(message) ? "names Subscription.js and its line" : message.split("\n")[0].slice(0, 80),
    "the compile error",
  ).toBe("names Subscription.js and its line");
});

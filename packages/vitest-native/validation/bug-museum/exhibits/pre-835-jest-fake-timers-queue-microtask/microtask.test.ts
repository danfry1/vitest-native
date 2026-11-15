// A Jest suite whose code reports back through queueMicrotask, as react-native-worklets'
// Jest mock does for runOnJS and scheduleOnRN.
test("a queued callback waits for the fake timers, as under Jest", async () => {
  jest.useFakeTimers();
  const reported = jest.fn();
  queueMicrotask(reported);
  await Promise.resolve();
  expect(reported).not.toHaveBeenCalled();
  jest.runAllTimers();
  expect(reported).toHaveBeenCalledTimes(1);
  jest.useRealTimers();
});

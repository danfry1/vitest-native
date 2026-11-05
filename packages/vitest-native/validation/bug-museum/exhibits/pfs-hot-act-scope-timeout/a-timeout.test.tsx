import { act } from "@testing-library/react-native";

// Expected to fail: it times out while awaiting act(), so React's act() scope is still
// open when the file ends. `it.fails` keeps this file green; the exhibit is about the
// files that run after it on the same worker.
it.fails("times out while awaiting act()", { timeout: 100 }, async () => {
  await act(async () => {
    await new Promise((resolve) => setTimeout(resolve, 30_000));
  });
});

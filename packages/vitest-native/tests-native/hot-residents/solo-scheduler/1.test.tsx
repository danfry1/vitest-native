import { test, vi } from "vitest";

// React's scheduler captures the timers it loads under. This file is the first on the
// worker to load React, under fake timers.
vi.useFakeTimers();

test("renders under fake timers", async () => {
  const React = await import("react");
  const { Text } = await import("react-native");
  const { render } = await import("@testing-library/react-native");
  await render(React.createElement(Text, null, "first"));
  vi.useRealTimers();
});

// One of two identical files: the webview preset's WebView, which hands its methods to a
// ref with useImperativeHandle from the rendering React.
import React from "react";
import { WebView } from "react-native-webview";
import { render, screen } from "@testing-library/react-native";

// The React this file rendered with, kept on `process` (which the hot reset leaves alone)
// for the next file to compare: under freshRuntime each file has its own, and with React
// resident (the gate's control edits `fresh` to false) every file has the first one.
const seen = ((process as { __vnFreshReacts?: unknown[] }).__vnFreshReacts ??= []);
const fresh = true;

test("a WebView renders and gives its ref the WebView's methods", async () => {
  const ref = React.createRef<{ reload: () => void }>();
  await render(<WebView ref={ref} testID="web" source={{ uri: "https://example.com" }} />);
  expect(screen.getByTestId("web")).toBeTruthy();
  expect(typeof ref.current?.reload, "the WebView's reload method on its ref").toBe("function");
});

test("renders with this file's own React under freshRuntime, the first file's otherwise", () => {
  if (fresh) expect(seen, "an earlier file's React").not.toContain(React);
  else if (seen.length > 0) expect(seen).toContain(React);
  seen.push(React);
});

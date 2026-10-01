/**
 * `./App` must resolve to App.tsx even when an app.json sits beside it.
 *
 * The React Native CLI template ships both, and its own test imports `../App`. Metro's
 * extension order tries `.json` before `.tsx`, and macOS and Windows disks answer
 * "does App.json exist?" with yes when only app.json does, so the template's test
 * rendered `{ name, displayName }` ("Element type is invalid … got: object"). Metro
 * resolves from a case-sensitive file map; so must we. On Linux this passes either
 * way — the macOS and Windows CI legs are the ones it guards.
 */
import { render, screen } from "@testing-library/react-native";
import { expect, it } from "vitest";
import App from "./fixtures/case-collision/App";

it("resolves ./App to App.tsx, not app.json", async () => {
  expect(typeof App).toBe("function");
  await render(<App />);
  expect(screen.getByText("case collision app")).toBeTruthy();
});

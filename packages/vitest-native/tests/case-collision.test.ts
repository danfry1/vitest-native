// The mock engine resolves `./App` the same way as the native engine: App.tsx, not
// the app.json beside it (see tests-native/case-collision.test.tsx). Guarded on the
// macOS and Windows CI legs, whose disks are case-insensitive.
import { expect, it } from "vitest";
import App from "./fixtures/case-collision/App";

it("resolves ./App to App.tsx under the mock engine", () => {
  expect(typeof App).toBe("function");
});

// Which requests the engine resolves through a package's react-native field
// (native/resolve.mjs): a whole installed package, never a path, a subpath, a builtin, a
// subpath import or React Native itself.
import { expect, it } from "vitest";
import { isWholePackageRequest } from "../src/native/resolve.mjs";

it("is a whole package", () => {
  expect(isWholePackageRequest("react-native-worklets")).toBe(true);
  expect(isWholePackageRequest("@scope/pkg")).toBe(true);
});

it("is not a path, a subpath, a builtin, a subpath import or React Native", () => {
  for (const request of [".", "..", "./index", "../x", "/abs/pkg", "pkg/sub", "@scope/pkg/sub"]) {
    expect(isWholePackageRequest(request), request).toBe(false);
  }
  for (const request of ["fs", "node:path", "#internal", "react-native", "@react-native/x"]) {
    expect(isWholePackageRequest(request), request).toBe(false);
  }
});

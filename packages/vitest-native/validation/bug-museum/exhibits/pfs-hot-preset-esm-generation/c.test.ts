// One of three files on one hot worker (a, b, c). Each sets its own inset and checks what
// ES module and CommonJS libraries in node_modules see of this file's preset mock.
import { createRequire } from "node:module";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { safeArea, topInset } from "esm-insets-a";
import { safeArea as safeAreaB } from "esm-insets-b";

const cjs = createRequire(import.meta.url)("cjs-insets");
const insets = { top: 3, right: 0, bottom: 0, left: 0 };

test("an ES dependency reads the value this file mocked", () => {
  vi.mocked(useSafeAreaInsets).mockReturnValue(insets);
  expect(topInset(), "this file's preset mock").toBe(3);
});

test("this file's call assertions see the ES dependency's calls", () => {
  vi.mocked(useSafeAreaInsets).mockClear();
  expect(useSafeAreaInsets, "this file's preset mock").not.toHaveBeenCalled();
  topInset();
  expect(useSafeAreaInsets, "this file's preset mock").toHaveBeenCalledTimes(1);
});

test("an import and a require of the preset give the same mock", () => {
  expect(safeArea.useSafeAreaInsets, "this file's preset mock").toBe(useSafeAreaInsets);
  expect(cjs.useSafeAreaInsets, "this file's preset mock").toBe(useSafeAreaInsets);
});

test("the file's ES modules share one preset module", () => {
  expect(safeAreaB, "this file's preset mock").toBe(safeArea);
});

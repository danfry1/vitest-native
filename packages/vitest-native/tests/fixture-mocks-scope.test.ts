/**
 * jestMockTransform() applies every __mocks__ file under the Vite root, as Jest's haste map
 * does. A tests-native config without a root of its own is rooted at tests-native/, where the
 * root-mocks fixtures keep a __mocks__/react-native.js and other manual mocks; a suite that
 * picks them up tests those mocks instead of its own subject (rn-deep-mock did). Each such
 * config passes OTHER_FIXTURES_MOCKS (tests-native/support/fixture-mocks.mts) or
 * rootMocks: false.
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { expect, it } from "vitest";

const dir = path.join(path.dirname(fileURLToPath(import.meta.url)), "../tests-native");

it("every tests-native config rooted at tests-native/ keeps other fixtures' manual mocks out", () => {
  const unscoped = fs
    .readdirSync(dir)
    .filter((name) => name.endsWith(".config.mts"))
    .filter((name) => {
      const source = fs.readFileSync(path.join(dir, name), "utf8");
      if (!/jestMockTransform\(/.test(source)) return false;
      if (/^\s*root:/m.test(source)) return false;
      const calls = source.match(/jestMockTransform\([^)]*\)/g) ?? [];
      return calls.some(
        (call) => !call.includes("OTHER_FIXTURES_MOCKS") && !/rootMocks:\s*false/.test(call),
      );
    });
  expect(unscoped).toEqual([]);
});

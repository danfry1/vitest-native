/**
 * With default flags (nodeMocks off), Vite still inlines an installed package's TypeScript
 * source, which is the route by which a vi.mock reaches that package's own imports. Giving
 * such files to Node there would leave the import reading the real module, so #544's
 * fix applies only with nodeMocks on (tests-native/node-mocks/installed-typescript.test.ts).
 */
import { expect, it, vi } from "vitest";
import { read } from "vn-installed-ts-consumer";

vi.mock("dispatch-target-lib", () => ({ source: "mocked" }));

it("lets a vi.mock reach an installed TypeScript package's own import", () => {
  expect(read()).toBe("mocked");
});

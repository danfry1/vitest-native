// A query on a project .js file keeps its meaning: `?raw` is the file's text, not
// compiled JS. An automocked .js module with JSX still mocks its exports.
import { expect, it, vi } from "vitest";
// oxlint-disable-next-line import/default -- a ?raw import is the file's text
import raw from "./greeting.js?raw";
import { Greeting } from "./greeting.js";

vi.mock("./greeting.js");

it("serves ?raw as the file's own text", () => {
  expect(raw).toContain("return <Text>Hello {name}</Text>;");
});

it("automocks a .js module that uses JSX", () => {
  expect(vi.isMockFunction(Greeting)).toBe(true);
});

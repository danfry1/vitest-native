// A project's own plugins keep their .js files: a plugin's load wins over the JSX
// compile, and a plugin's transform still runs on the compiled file.
import { expect, it } from "vitest";
import { servedBy } from "./served-by-plugin.js";
import { element, marker } from "./transformed.js";

it("serves a .js file the way a project's load plugin returns it", () => {
  expect(servedBy).toBe("plugin");
});

it("runs a project's transform plugin on a .js file with JSX", () => {
  expect(marker).toBe("applied");
  expect(element.props.children).toBe("transformed");
});

// The test imports the store through Vite, and requires it through Node from a path built
// on the project root as given (the run's working directory). Node then holds a second
// copy, which the ownership guard reports as evaluated twice, whichever spelling the root
// was given in.
import { createRequire } from "node:module";
import path from "node:path";
import { expect, it } from "vitest";
import { store } from "./src/store";

it("holds the store twice", () => {
  const viaNode = createRequire(path.join(process.cwd(), "package.json"))("./src/store.ts");
  expect(viaNode.store).not.toBe(store);
});

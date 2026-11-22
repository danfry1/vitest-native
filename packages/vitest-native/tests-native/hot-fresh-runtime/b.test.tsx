import { expect, it } from "vitest";
import { files, see } from "./record";

it("the next file in the worker has its own React and RNTL, one instance of each", async () => {
  const [first] = files;
  expect(first, "a.test.tsx ran first in this worker").toBeDefined();
  const seen = await see();
  // Compared as facts, so a failure prints them rather than the modules.
  expect({
    freshEsmReact: seen.esmReact !== first.esmReact,
    freshCjsReact: seen.cjsReact !== first.cjsReact,
    oneReact: seen.esmReact === seen.cjsReact,
    freshRntl: seen.render !== first.render,
    // useId counts from the start again, as in a file of its own.
    sameId: seen.id === first.id,
  }).toEqual({
    freshEsmReact: true,
    freshCjsReact: true,
    oneReact: true,
    freshRntl: true,
    sameId: true,
  });
});

// One of two files in one hot worker: an ES index the engine compiles to CommonJS, whose
// require()s of its CommonJS siblings must link and return what they export.
import { Root, fnKind, made } from "vn-compiled-mjs";
import { made as madeDirect } from "vn-compiled-mjs/parts";

const seen = ((process as unknown as { __compiledMjs?: number[] }).__compiledMjs ??= []);

test("the compiled index's require()s link and return module.exports", () => {
  expect(Root).toBe("root");
  expect(fnKind).toBe("function");
});

test("a sibling is one instance within a file, and new in each file", () => {
  expect(made, "the index's require and the file's import").toBe(madeDirect);
  expect(seen).not.toContain(made);
  seen.push(made);
});

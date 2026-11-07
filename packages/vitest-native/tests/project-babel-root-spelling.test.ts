/**
 * projectBabel under a root spelled unlike Vite's ids. Vite gives a file by its native real
 * path with forward slashes; the root can arrive in another spelling of the same directory
 * (a Windows 8.3 short name such as RUNNER~1, a symlinked or junctioned directory). Such a
 * file is still the project's own, and the project's Babel config still applies to it.
 */
import fs from "node:fs";
import { createRequire } from "node:module";
import os from "node:os";
import path from "node:path";
import { afterAll, expect, it } from "vitest";
import { createProjectBabel } from "../src/project-babel.js";

const req = createRequire(import.meta.url);
const real = fs.mkdtempSync(path.join(fs.realpathSync.native(os.tmpdir()), "vn-pb-spelling-"));
// Another spelling of the same directory: a junction on Windows, a symlink elsewhere.
const alias = `${real}-alias`;
fs.symlinkSync(real, alias, process.platform === "win32" ? "junction" : "dir");
afterAll(() => {
  fs.unlinkSync(alias);
  fs.rmSync(real, { recursive: true, force: true });
});

fs.writeFileSync(path.join(real, "package.json"), JSON.stringify({ name: "app", private: true }));
fs.mkdirSync(path.join(real, "node_modules", "@babel"), { recursive: true });
fs.symlinkSync(
  path.dirname(fs.realpathSync(req.resolve("@babel/core/package.json"))),
  path.join(real, "node_modules", "@babel", "core"),
  process.platform === "win32" ? "junction" : "dir",
);
// Two local plugins, each replacing one identifier with a number: one from the root's
// babel.config.js, one from a .babelrc, which Babel reads only under a root spelled as
// the file is.
fs.mkdirSync(path.join(real, "plugins"));
const replacing = (name: string, value: number) =>
  `module.exports = ({ types: t }) => ({
     name: "replace-${name}",
     visitor: {
       Identifier(p) {
         if (p.node.name === "${name}") p.replaceWith(t.numericLiteral(${value}));
       },
     },
   });`;
fs.writeFileSync(path.join(real, "plugins", "answer.cjs"), replacing("__ANSWER__", 42));
fs.writeFileSync(path.join(real, "plugins", "question.cjs"), replacing("__QUESTION__", 6));
fs.writeFileSync(
  path.join(real, "babel.config.js"),
  `module.exports = { plugins: ["./plugins/answer.cjs"] };`,
);
fs.writeFileSync(
  path.join(real, ".babelrc.json"),
  JSON.stringify({ plugins: ["./plugins/question.cjs"] }),
);
fs.mkdirSync(path.join(real, "src"));
const file = path.join(real, "src", "answer.ts");
const source = "export const answer = __ANSWER__;\nexport const question = __QUESTION__;\n";
fs.writeFileSync(file, source);
// The file as Vite's id spells it.
const id = file.split(path.sep).join("/");

it.each([
  ["the root in Vite's spelling", real],
  ["the root through a symlink or junction", alias],
  // os.tmpdir() as given. The test run's temporary root comes from fs.realpathSync, which
  // keeps a Windows 8.3 short name (RUNNER~1 on GitHub's runners), while `real` is the
  // native, long spelling. Elsewhere the two are the same.
  ["the root as the temporary directory spells it", path.join(os.tmpdir(), path.basename(real))],
])("compiles project source with the project's Babel config, %s", async (_, root) => {
  const compiled: string[] = [];
  const projectBabel = createProjectBabel(root, "auto", {
    active: [],
    hasExpo: false,
    platform: "ios",
    onCompile: (name) => compiled.push(name),
  });
  expect(projectBabel).not.toBeNull();
  expect(projectBabel!.cacheKey(id, source)).not.toBe("");
  const result = await projectBabel!.load(id, undefined);
  const code = result && typeof result === "object" ? result.code : result;
  expect(code).toContain("answer = 42");
  expect(code).toContain("question = 6");
  expect(compiled).toEqual(["src/answer.ts"]);
});

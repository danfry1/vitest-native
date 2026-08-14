/**
 * Discriminating experiment for project-scoped transformer state.
 *
 * The transformer once initialized module-scope globals (`_req`, `_preset`,
 * `_cacheDir`, the in-memory cache) exactly once per process — first caller
 * wins. `transformRN(file, src, projectRoot)` accepts a root PER CALL, but a
 * second project's calls silently reused the first project's resolved
 * toolchain and cache directory. In a Vitest workspace, registries for every
 * project are built in the one Vite main process, so two projects with
 * different React Native or Babel versions could ship the first project's
 * output to the second project's tests.
 *
 * The probe makes the toolchains DISTINGUISHABLE at runtime: each tmp project
 * root carries its own stub `@react-native/babel-preset` whose plugin stamps a
 * root-specific marker into every transformed file. If project Y's file comes
 * back stamped with X's marker, the toolchain was pinned. Both directions are
 * asserted, so the test is order-independent evidence.
 */
import { describe, it, expect } from "vitest";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { createRequire } from "node:module";
// @ts-expect-error — runtime .mjs
import { transformRN, transformCacheDir } from "../src/native/transform.mjs";

const req = createRequire(import.meta.url);

/** A stub preset whose plugin appends `var __VN_TOOLCHAIN = "<marker>";`. */
function presetSource(marker: string): string {
  return `
module.exports = () => ({
  plugins: [
    {
      visitor: {
        Program: {
          exit(programPath) {
            programPath.pushContainer("body", {
              type: "VariableDeclaration",
              kind: "var",
              declarations: [
                {
                  type: "VariableDeclarator",
                  id: { type: "Identifier", name: "__VN_TOOLCHAIN" },
                  init: { type: "StringLiteral", value: ${JSON.stringify(marker)} },
                },
              ],
            });
          },
        },
      },
    },
  ],
});
`;
}

/** A project root with its own marker preset and a link to the real @babel/core. */
function makeRoot(marker: string): string {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), `vn-proj-${marker}-`));
  fs.writeFileSync(
    path.join(root, "package.json"),
    JSON.stringify({ name: `proj-${marker}`, private: true }),
  );
  const presetDir = path.join(root, "node_modules", "@react-native", "babel-preset");
  fs.mkdirSync(presetDir, { recursive: true });
  fs.writeFileSync(
    path.join(presetDir, "package.json"),
    JSON.stringify({
      name: "@react-native/babel-preset",
      // Distinct versions keep the two roots' disk caches in distinct
      // directories even if they ever shared a cache root.
      version: `0.0.1-${marker}`,
      main: "index.js",
    }),
  );
  fs.writeFileSync(path.join(presetDir, "index.js"), presetSource(marker));
  // The real @babel/core, reached through a symlink: Node resolves its own
  // dependencies from its REAL path, so the workspace install keeps working.
  const babelScope = path.join(root, "node_modules", "@babel");
  fs.mkdirSync(babelScope, { recursive: true });
  fs.symlinkSync(
    path.dirname(fs.realpathSync(req.resolve("@babel/core/package.json"))),
    path.join(babelScope, "core"),
    "dir",
  );
  return root;
}

describe("transformer state is scoped per project root", () => {
  it("two roots keep their own toolchains and cache directories, both orders", () => {
    const rootX = makeRoot("X");
    const rootY = makeRoot("Y");
    try {
      const fileX = path.join(rootX, "moduleX.js");
      const fileY = path.join(rootY, "moduleY.js");
      fs.writeFileSync(fileX, "export const a = 1;\n");
      fs.writeFileSync(fileY, "export const a = 1;\n");

      // X first, then Y: under first-caller-wins, Y's output carried X's stamp.
      const outX = transformRN(fileX, fs.readFileSync(fileX, "utf8"), rootX);
      const outY = transformRN(fileY, fs.readFileSync(fileY, "utf8"), rootY);
      expect(outX).toContain('__VN_TOOLCHAIN = "X"');
      expect(outY).toContain('__VN_TOOLCHAIN = "Y"');

      // And X again AFTER Y, so neither ordering can mask a pinned toolchain.
      const outX2 = transformRN(fileX, fs.readFileSync(fileX, "utf8"), rootX);
      expect(outX2).toContain('__VN_TOOLCHAIN = "X"');

      // Each project's disk cache lives under its own root — output produced
      // for one project must not populate (or be served from) another's cache.
      const dirX = transformCacheDir(rootX);
      const dirY = transformCacheDir(rootY);
      expect(dirX).toContain(rootX);
      expect(dirY).toContain(rootY);
      expect(dirX).not.toBe(dirY);
    } finally {
      fs.rmSync(rootX, { recursive: true, force: true });
      fs.rmSync(rootY, { recursive: true, force: true });
    }
  });
});

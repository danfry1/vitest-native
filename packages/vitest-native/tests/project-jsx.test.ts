import { describe, expect, it } from "vitest";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { isProjectJsFile, loadProjectJsx, projectJsxOptions } from "../src/project-jsx.js";

const OPTIONS = projectJsxOptions({ jsx: { runtime: "automatic" } });

function tempFile(relative: string, code: string): string {
  const dir = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), "vn-project-jsx-")));
  const file = path.join(dir, relative);
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, code);
  return file.split(path.sep).join("/");
}

describe("project .js files compiled as JSX (#561)", () => {
  it("covers the project's own .js files", () => {
    expect(isProjectJsFile("/app/jest.setup.js")).toBe(true);
    expect(isProjectJsFile("/app/src/Button.test.js")).toBe(true);
    expect(isProjectJsFile("C:\\app\\src\\Button.js")).toBe(process.platform === "win32");
  });

  it("leaves packages, virtual modules and other extensions to their own path", () => {
    expect(isProjectJsFile("/app/node_modules/lib/index.js")).toBe(false);
    expect(isProjectJsFile("C:\\app\\node_modules\\lib\\index.js")).toBe(false);
    expect(isProjectJsFile("\0virtual:rn-facade")).toBe(false);
    expect(isProjectJsFile("/app/src/a.mjs")).toBe(false);
    expect(isProjectJsFile("/app/src/a.jsx")).toBe(false);
    expect(isProjectJsFile("/app/src/a.ts")).toBe(false);
    expect(isProjectJsFile("/app/src/a.js?raw")).toBe(false);
    expect(isProjectJsFile("/app/src/a.js?url")).toBe(false);
  });

  it("compiles with Vite's resolved Oxc options as JSX, without its file filters", () => {
    expect(
      projectJsxOptions({
        jsx: { runtime: "automatic", importSource: "custom" },
        include: /x/,
        exclude: /y/,
        jsxInject: "import React from 'react'",
      }),
    ).toEqual({ jsx: { runtime: "automatic", importSource: "custom" }, lang: "jsx" });
  });

  it("does nothing when Oxc is turned off", () => {
    expect(projectJsxOptions(false)).toBeUndefined();
  });

  it("compiles a project .js file with JSX, and leaves the same file in node_modules alone", async () => {
    const source = "export const a = <Text>hi</Text>;\n";
    const project = await loadProjectJsx(
      tempFile("src/a.js", source),
      OPTIONS,
      undefined,
      undefined,
    );
    expect(project).toMatchObject({ code: expect.stringContaining("react/jsx-runtime") });
    const pkg = tempFile("node_modules/lib/a.js", source);
    expect(await loadProjectJsx(pkg, OPTIONS, undefined, undefined)).toBeUndefined();
  });

  it("serves what another plugin's load returns for the file", async () => {
    const file = tempFile("src/a.js", "export const a = <Text>hi</Text>;\n");
    const chain = { load: async () => "export const a = 'plugin';" };
    expect(await loadProjectJsx(file, OPTIONS, undefined, chain)).toBe(
      "export const a = 'plugin';",
    );
  });
});

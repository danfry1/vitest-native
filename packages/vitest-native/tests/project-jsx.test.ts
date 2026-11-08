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
    ).toEqual({
      jsx: { runtime: "automatic", importSource: "custom", refresh: false },
      lang: "jsx",
    });
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

  it("leaves an id under the root that names no file to the plugin that serves it", async () => {
    // A virtual module spelled as a project path (jest-compat's root-mocks module, a
    // third-party plugin's): reading it from disk would fail the load (#666).
    const dir = path.dirname(tempFile("src/real.js", ""));
    const virtual = `${dir}/virtual-view.js`;
    expect(await loadProjectJsx(virtual, OPTIONS, undefined, undefined)).toBeUndefined();
    const chain = { load: async () => "export const a = 'plugin';" };
    expect(await loadProjectJsx(virtual, OPTIONS, undefined, chain)).toBeUndefined();
  });

  it("compiles a file another environment is loading at the same time", async () => {
    // Environment A's ask is still pending when environment B loads the same file
    // (two projects sharing a setup file): B must compile it, not skip it.
    const file = tempFile("src/setup.js", "export const a = <Text>hi</Text>;\n");
    let release!: () => void;
    let entered!: () => void;
    const pending = new Promise<void>((resolve) => (release = resolve));
    const asked = new Promise<void>((resolve) => (entered = resolve));
    const slow = { load: async () => (entered(), await pending, null) };
    const a = loadProjectJsx(file, OPTIONS, undefined, slow);
    await asked;
    const b = await loadProjectJsx(file, OPTIONS, undefined, { load: async () => null });
    release();
    expect(b).toMatchObject({ code: expect.stringContaining("react/jsx-runtime") });
    expect(await a).toMatchObject({ code: expect.stringContaining("react/jsx-runtime") });
  });

  it("answers nothing to its own question, then compiles", async () => {
    const file = tempFile("src/a.js", "export const a = <Text>hi</Text>;\n");
    const inner: unknown[] = [];
    const chain = {
      load: async (id: string) => {
        inner.push(await loadProjectJsx(id, OPTIONS, undefined, chain));
        return null;
      },
    };
    const outer = await loadProjectJsx(file, OPTIONS, undefined, chain);
    expect(inner).toEqual([undefined]);
    expect(outer).toMatchObject({ code: expect.stringContaining("react/jsx-runtime") });
  });

  it("leaves a file Oxc cannot parse as JSX (Flow) to later plugins, and says so", async () => {
    const file = tempFile("src/flow.js", "// @flow\nexport function f(x: Array<string>) {}\n");
    const logged: string[] = [];
    const result = await loadProjectJsx(file, OPTIONS, undefined, undefined, (m) => logged.push(m));
    expect(result).toBeUndefined();
    expect(logged).toEqual([expect.stringContaining("serving it unchanged")]);
  });
});

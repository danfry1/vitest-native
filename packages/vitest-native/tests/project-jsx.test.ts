import { describe, expect, it } from "vitest";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import {
  isPackageJsFile,
  isProjectJsFile,
  loadPackageJsx,
  loadProjectJsx,
  packageOfFile,
  projectJsxOptions,
} from "../src/project-jsx.js";

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

describe("a package's .js file Vite serves uncompiled and cannot parse (#763)", () => {
  const JSX = 'import { Text } from "react-native";\nexport const a = <Text>hi</Text>;\n';

  /** Loads `file`, counting the compiles (one log line each) and the warnings. */
  async function load(file: string, chain?: { load: () => Promise<string | null> }) {
    const compiles: string[] = [];
    const warnings: string[] = [];
    const result = await loadPackageJsx(
      file,
      OPTIONS,
      undefined,
      chain,
      (m) => compiles.push(m),
      (m) => warnings.push(m),
    );
    return { result, compiles, warnings };
  }

  it("covers .js files inside node_modules only", () => {
    expect(isPackageJsFile("/app/node_modules/lib/index.js")).toBe(true);
    expect(isPackageJsFile("/app/src/a.js")).toBe(false);
    expect(isPackageJsFile("/app/node_modules/lib/index.ts")).toBe(false);
    expect(isPackageJsFile("/app/node_modules/lib/index.js?raw")).toBe(false);
  });

  it("names the package, scoped or not, from the innermost node_modules", () => {
    expect(packageOfFile("/app/node_modules/lib/src/a.js")).toBe("lib");
    expect(packageOfFile("/app/node_modules/@scope/lib/a.js")).toBe("@scope/lib");
    expect(packageOfFile("/app/node_modules/.bun/x@1/node_modules/@s/y/a.js")).toBe("@s/y");
    expect(packageOfFile("/app/src/a.js")).toBeNull();
  });

  it("compiles JSX in a file the parser rejects, once", async () => {
    const { result, compiles, warnings } = await load(tempFile("node_modules/lib/a.js", JSX));
    expect(result).toMatchObject({ code: expect.stringContaining("react/jsx-runtime") });
    expect(compiles).toHaveLength(1);
    expect(warnings).toEqual([]);
  });

  it("leaves a file that already parses as published, even when it matches the prefilter", async () => {
    // `a<b` matches the cheap `<Name` prefilter, so this reaches the parse check.
    const plain = "export const lt = (a, b) => a<b;\n";
    const { result, compiles } = await load(tempFile("node_modules/lib/plain.js", plain));
    expect(result).toBeUndefined();
    expect(compiles).toHaveLength(0);
  });

  it("leaves the project's own files to loadProjectJsx", async () => {
    const { result, compiles } = await load(tempFile("src/a.js", JSX));
    expect(result).toBeUndefined();
    expect(compiles).toHaveLength(0);
  });

  it("serves what another plugin's load returns for the file", async () => {
    const chain = { load: async () => "export const a = 'plugin';" };
    const { result, compiles } = await load(tempFile("node_modules/lib/a.js", JSX), chain);
    expect(result).toBe("export const a = 'plugin';");
    expect(compiles).toHaveLength(0);
  });

  it("serves a file Oxc cannot compile either as it is, and names the package once", async () => {
    // Flow: neither Vite's parser nor Oxc's JSX accepts it, so Vite reports its own error.
    const flow = "// @flow\nexport const a = (x: ?number) => <View />;\n";
    const first = await load(tempFile("node_modules/flow-only-lib/a.js", flow));
    expect(first.result).toBeUndefined();
    expect(first.warnings).toHaveLength(1);
    expect(first.warnings[0]).toContain("reactNative({ transform: ['flow-only-lib'] })");
    expect(first.warnings[0]).toContain("issues/763");
    const second = await load(tempFile("node_modules/flow-only-lib/b.js", flow));
    expect(second.result).toBeUndefined();
    expect(second.warnings).toEqual([]);
  });
});

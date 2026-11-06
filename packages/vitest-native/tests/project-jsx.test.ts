import { describe, expect, it } from "vitest";
import { isProjectJsFile, projectJsxOptions } from "../src/project-jsx.js";

describe("project .js files compiled as JSX (#561)", () => {
  it("covers the project's own .js files, with or without a query", () => {
    expect(isProjectJsFile("/app/jest.setup.js")).toBe(true);
    expect(isProjectJsFile("/app/src/Button.test.js?t=1")).toBe(true);
    expect(isProjectJsFile("C:\\app\\src\\Button.js")).toBe(process.platform === "win32");
  });

  it("leaves packages, virtual modules and other extensions to their own path", () => {
    expect(isProjectJsFile("/app/node_modules/lib/index.js")).toBe(false);
    expect(isProjectJsFile("C:\\app\\node_modules\\lib\\index.js")).toBe(false);
    expect(isProjectJsFile("\0virtual:rn-facade")).toBe(false);
    expect(isProjectJsFile("/app/src/a.mjs")).toBe(false);
    expect(isProjectJsFile("/app/src/a.jsx")).toBe(false);
    expect(isProjectJsFile("/app/src/a.ts")).toBe(false);
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
});

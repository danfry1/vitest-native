import { describe, it, expect } from "vitest";
import flowRemoveTypes from "flow-remove-types";

/** Collapse whitespace for easier assertions (flow-remove-types preserves positions with spaces). */
function normalize(s: string): string {
  return s.replace(/\s+/g, " ").trim();
}

describe("flow-remove-types", () => {
  it("strips basic Flow type annotations", () => {
    const code = `
      // @flow
      function add(a: number, b: number): number {
        return a + b;
      }
      export type Foo = { bar: string };
    `;
    const result = flowRemoveTypes(code, { all: true }).toString();
    expect(result).not.toContain(": number");
    expect(normalize(result)).toContain("function add(a , b )");
    expect(result).toContain("return a + b");
  });

  it("strips export type declarations", () => {
    const code = `
      // @flow
      export type EasingFunction = (t: number) => number;
      const x = 1;
    `;
    const result = flowRemoveTypes(code, { all: true }).toString();
    expect(result).not.toContain("EasingFunction");
    expect(result).toContain("const x = 1");
  });

  it("handles Flow component syntax", () => {
    const code = `
      // @flow
      import React from 'react';
      component View(
        ref?: React.RefSetter<any>,
        ...props: { style?: any }
      ) {
        return null;
      }
      export default View;
    `;
    const result = flowRemoveTypes(code, { all: true }).toString();
    expect(result).toContain("export default View");
  });

  it("preserves require calls", () => {
    const code = `
      // @flow
      'use strict';
      const _bezier = require('./bezier').default;
      function bezier(x1: number, y1: number): (x: number) => number {
        return _bezier(x1, y1);
      }
    `;
    const result = flowRemoveTypes(code, { all: true }).toString();
    expect(result).toContain("require('./bezier').default");
    expect(normalize(result)).toContain("function bezier(x1 , y1 )");
  });

  it("generates source maps", () => {
    const code = `
      // @flow
      function add(a: number, b: number): number {
        return a + b;
      }
    `;
    const result = flowRemoveTypes(code, { all: true });
    const map = result.generateMap();
    expect(map).toHaveProperty("version", 3);
    expect(map).toHaveProperty("mappings");
    expect(map).toHaveProperty("names");
    expect(map).toHaveProperty("sources");
  });
});

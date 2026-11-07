import { createRequire } from "node:module";
import { describe, expect, it } from "vitest";
import { factoryReadsInFile } from "../src/cli/mock-factory-reads.js";

const parse = (
  createRequire(createRequire(import.meta.url).resolve("@babel/core"))("@babel/parser") as {
    parse: (c: string, o: Record<string, unknown>) => unknown;
  }
).parse;

describe("jest.mock factories that read module-level bindings", () => {
  it("finds a factory reading a const declared below it (Rocket.Chat's pattern)", () => {
    const code = `import { checkSupportedVersions } from './checkSupportedVersions';
const MOCK_I18N = { en: {} };
const TODAY = '2023-04-01T00:00:00.000Z';
jest.mock('~/supportedversions', () => ({
  timestamp: '2023-04-01T00:00:00.000Z',
  enforcementStartDate: TODAY,
  i18n: MOCK_I18N,
}));
`;
    expect(factoryReadsInFile(parse, code)).toEqual([
      { line: 4, module: "~/supportedversions", names: ["MOCK_I18N", "TODAY"] },
    ]);
  });

  it("does not report reads that happen later, locals, var, or imports", () => {
    const code = `import { helper } from './helper';
const LATER = 1;
var OLD = 2;
class Thing {}
jest.mock('a', () => ({ get: () => LATER, make: function () { return new Thing(); } }));
jest.mock('b', () => { const LATER = 3; return { LATER, OLD, helper }; });
jest.mock('c');
`;
    expect(factoryReadsInFile(parse, code)).toEqual([]);
  });

  it("reads TypeScript and JSX test files, and names a class read eagerly", () => {
    const code = `import React from 'react';
class Store { static instance = 1 }
jest.mock('./store', () => ({ default: Store.instance }));
const el = <div />;
const typed: number = 1;
`;
    expect(factoryReadsInFile(parse, code)).toEqual([
      { line: 3, module: "./store", names: ["Store"] },
    ]);
  });
});

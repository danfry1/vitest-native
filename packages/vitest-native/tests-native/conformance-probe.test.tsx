/**
 * The conformance probe's own rules (conformance/probe.tsx, checkExport): a function or
 * hook that throws when called fails like any other difference (#854), unless the probe is
 * told how to call it (`args`) or why it is not called (`noCall`).
 */
import { describe, expect, it } from "vitest";
import { checkExport } from "./conformance/probe";
import type { ExportContract } from "./conformance/shape";

const returnsNumber: ExportContract = {
  kind: "function",
  parameters: [{ kind: "number" }],
  returns: { kind: "number" },
};

async function check(
  module: Record<string, unknown>,
  name: string,
  declared: ExportContract = returnsNumber,
  options = {},
) {
  const report = { unchecked: [] as string[], extra: [] as string[] };
  const found = await checkExport(module, name, declared, options, report);
  return { found, report };
}

describe("conformance probe", () => {
  it("fails a function that throws when called", async () => {
    const { found, report } = await check(
      {
        double: () => {
          throw new Error("boom");
        },
      },
      "double",
    );
    expect(found).toEqual(["double(): threw: boom"]);
    expect(report.unchecked).toEqual([]);
  });

  it("fails a hook that throws in a render", async () => {
    const { found } = await check(
      {
        useValue: () => {
          throw new Error("no provider");
        },
      },
      "useValue",
    );
    expect(found).toEqual(["useValue(): threw: no provider"]);
  });

  it("passes a function that returns its declared shape", async () => {
    const { found } = await check({ double: (n: number) => n * 2 }, "double");
    expect(found).toEqual([]);
  });

  it("calls a function with the arguments it is given", async () => {
    const strict = (n: unknown) => {
      if (n !== 4) throw new Error("wants 4");
      return 8;
    };
    expect((await check({ strict }, "strict")).found).toEqual(["strict(): threw: wants 4"]);
    expect(
      (await check({ strict }, "strict", returnsNumber, { args: { strict: () => [4] } })).found,
    ).toEqual([]);
  });

  it("does not call a function with a noCall entry, and says why", async () => {
    const throws = () => {
      throw new Error("boom");
    };
    const { found, report } = await check({ throws }, "throws", returnsNumber, {
      noCall: { throws: "needs a browser" },
    });
    expect(found).toEqual([]);
    expect(report.unchecked).toEqual(["throws (needs a browser)"]);
  });
});

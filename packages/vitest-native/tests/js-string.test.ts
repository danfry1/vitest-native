/**
 * jsString (src/js-string.mjs): a value as a JavaScript string literal that generated code
 * can carry safely. JSON's escaping covers quotes and backslashes; `<`, `>` and the line
 * separators U+2028/U+2029 are escaped as well, since they can end a script tag or a line
 * in the code around the literal.
 */
import vm from "node:vm";
import { describe, expect, it } from "vitest";
import { jsString } from "../src/js-string.mjs";

const roundTrip = (value: string) => vm.runInNewContext(jsString(value));

describe("jsString", () => {
  it("reads back as the same string, whatever it holds", () => {
    for (const value of [
      "plain",
      'quote " and \\ backslash',
      "C:\\Users\\RUNNER~1\\app.ts",
      "</script><script>alert(1)</script>",
      "line\nbreak\r\ttab\0nul",
      "sep\u2028par\u2029end",
      "`${template}`",
    ]) {
      expect(roundTrip(value)).toBe(value);
    }
  });

  it("leaves no character that can end a script tag or a line", () => {
    const literal = jsString("</script>\u2028\u2029\n");
    expect(literal).not.toMatch(/[<>\u2028\u2029\n]/);
    expect(literal).toContain("\\u003C");
    expect(literal).toContain("\\u2028");
  });
});

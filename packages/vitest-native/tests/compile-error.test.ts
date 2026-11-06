import MagicString from "magic-string";
import { describe, expect, it } from "vitest";
import { originalPosition, withCompileLocation } from "../src/native/compile-error.mjs";

/** A SyntaxError as Node's vm reports one: the location only in the stack's header. */
function compileError(file: string, line: number, code: string, column: number): SyntaxError {
  const error = new SyntaxError("Invalid or unexpected token");
  error.stack =
    `${file}:${line}\n${code}\n${" ".repeat(column)}^\n\n` +
    "SyntaxError: Invalid or unexpected token\n    at new Script (node:vm:117:7)";
  return error;
}

describe("withCompileLocation: a module that does not compile names where", () => {
  it("puts the header's location in the message and the line in `frame`", () => {
    const error = withCompileLocation(compileError("/app/Sub.js", 4, "  @field name;", 2));
    expect(error.message).toBe("Invalid or unexpected token (/app/Sub.js:4:3)");
    expect((error as { frame?: string }).frame).toBe("4 |   @field name;\n      ^");
  });

  it("maps the compiled position back to the source through the module's sourcemap", () => {
    const source = "const a = 1;\n@field name;\n";
    const s = new MagicString(source);
    s.prepend("import x from 'y';\n"); // the compiled code is one line longer
    const map = s.generateMap({ hires: true, includeContent: true, source: "/app/Sub.js" });
    const error = withCompileLocation(compileError("/app/Sub.js", 3, "@field name;", 0), () => map);
    expect(error.message).toBe("Invalid or unexpected token (/app/Sub.js:2:1)");
    expect((error as { frame?: string }).frame).toBe("2 | @field name;\n    ^");
  });

  it("leaves other errors, errors without the header, and located errors alone", () => {
    const type = new TypeError("x is not a function");
    expect(withCompileLocation(type).message).toBe("x is not a function");
    const bare = new SyntaxError("Unexpected token");
    bare.stack = "SyntaxError: Unexpected token\n    at foo (/app/a.js:1:1)";
    expect(withCompileLocation(bare).message).toBe("Unexpected token");
    const once = withCompileLocation(compileError("/app/Sub.js", 4, "@x", 0));
    expect(withCompileLocation(once).message).toBe("Invalid or unexpected token (/app/Sub.js:4:1)");
  });

  it("decodes a v3 mapping, and returns null for a line with none", () => {
    const s = new MagicString("a;\nb;\n");
    s.prepend("// header\n");
    const map = s.generateMap({ hires: true });
    expect(originalPosition(map, 2, 0)).toEqual({ line: 1, column: 0 });
    expect(originalPosition(map, 3, 0)).toEqual({ line: 2, column: 0 });
    expect(originalPosition({ mappings: "" }, 1, 0)).toBeNull();
  });
});

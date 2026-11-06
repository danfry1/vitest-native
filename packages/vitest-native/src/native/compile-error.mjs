// Where a module failed to compile, on the error Vitest reports.
//
// A module that does not compile (a decorator, or other syntax Node cannot run, that
// reached Node uncompiled) fails in V8 with a SyntaxError such as "Invalid or unexpected
// token". V8 does not put the location in the message or in a stack frame. Node writes
// it only as a header on the stack, for the code as compiled:
//
//   /app/src/model/Subscription.js:24
//     @field("name") name;
//     ^
//
//   SyntaxError: Invalid or unexpected token
//       at new Script (node:vm:117:7) ...
//
// Vitest's report prints the name, the message and the stack's frames. Here every frame
// is Node's or Vitest's own, so the report named no file at all. This puts the location
// in the message, mapped back to the source file through the module's sourcemap when
// there is one, and the source line under it as `frame`, which Vitest prints.
const HEADER = /^(?<file>[^\n]+?):(?<line>\d+)\n(?<code>[^\n]*)\n(?<caret>[ \t]*\^+)[ \t]*\n/;

/**
 * `error` with its compile location in the message and a `frame`, when it is a
 * SyntaxError whose stack starts with Node's location header; otherwise unchanged.
 * `sourceMapFor(file)` returns the compiled module's sourcemap (a v3 object) or null,
 * and does not throw.
 * Idempotent: an error that already names its location is left as it is.
 */
export function withCompileLocation(error, sourceMapFor = () => null) {
  if (!(error instanceof SyntaxError) || typeof error.stack !== "string") return error;
  const match = HEADER.exec(error.stack);
  if (!match?.groups) return error;
  const { file, code, caret } = match.groups;
  let line = Number(match.groups.line);
  let column = caret.indexOf("^"); // 0-based
  let text = code;
  let pointer = caret;
  const map = sourceMapFor(file);
  const original = map ? originalPosition(map, line, column) : null;
  if (original) {
    const sourceLine = sourceLineOf(map, original.line);
    if (sourceLine !== null) {
      line = original.line;
      column = original.column;
      text = sourceLine;
      const indent = sourceLine.slice(0, column).replace(/[^\t]/g, " ");
      pointer = `${indent}^`;
    }
  }
  const location = `${file}:${line}:${column + 1}`;
  if (error.message.includes(location)) return error;
  error.message = `${error.message} (${location})`;
  if (error.frame === undefined) {
    const gutter = `${line} | `;
    error.frame = `${gutter}${text}\n${" ".repeat(gutter.length)}${pointer}`;
  }
  return error;
}

/**
 * Line `line` (1-based) of the map's single source, from its sourcesContent, which Vite's
 * maps carry; null without it, and the compiled position is kept.
 */
function sourceLineOf(map, line) {
  const content = Array.isArray(map.sourcesContent) ? map.sourcesContent[0] : null;
  if (typeof content !== "string") return null;
  const lines = content.split(/\r?\n/);
  return line >= 1 && line <= lines.length ? lines[line - 1] : null;
}

/**
 * The source position (1-based line, 0-based column) a v3 sourcemap gives for the
 * generated position, from the last mapping at or before it on that line; null when
 * the line has none.
 */
export function originalPosition(map, line, column) {
  if (typeof map?.mappings !== "string") return null;
  const lines = map.mappings.split(";");
  let sourceLine = 0;
  let sourceColumn = 0;
  let source = 0;
  let found = null;
  for (let i = 0; i < lines.length && i < line; i++) {
    let generatedColumn = 0;
    for (const segment of lines[i].split(",")) {
      if (segment === "") continue;
      const fields = decodeVlq(segment);
      generatedColumn += fields[0];
      if (fields.length < 4) continue;
      source += fields[1];
      sourceLine += fields[2];
      sourceColumn += fields[3];
      if (i === line - 1 && generatedColumn <= column && source === 0) {
        found = { line: sourceLine + 1, column: sourceColumn + (column - generatedColumn) };
      }
    }
  }
  return found;
}

const BASE64 = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/";

/** The integers of one Base64 VLQ segment. */
function decodeVlq(segment) {
  const values = [];
  let value = 0;
  let shift = 0;
  for (const char of segment) {
    const digit = BASE64.indexOf(char);
    if (digit === -1) return values;
    value += (digit & 31) << shift;
    if (digit & 32) {
      shift += 5;
    } else {
      values.push(value & 1 ? -(value >>> 1) : value >>> 1);
      value = 0;
      shift = 0;
    }
  }
  return values;
}

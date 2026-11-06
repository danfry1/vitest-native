/**
 * Whether a file is standard JavaScript, read with the project's own Babel parser and no
 * syntax plugins: JSX and Flow are not, ES-module syntax is. Shared by detection
 * (ecosystem.ts, the react-native field check) and `migrate` (cli/untranspiled.ts).
 */
import { createRequire } from "node:module";
import fs from "node:fs";
import path from "node:path";

export type Parse = (code: string, options: Record<string, unknown>) => unknown;

export function babelParser(root: string): Parse | null {
  const req = createRequire(path.join(root, "package.json"));
  for (const from of [() => req, () => createRequire(req.resolve("@babel/core"))]) {
    try {
      return (from()("@babel/parser") as { parse: Parse }).parse;
    } catch {
      // not resolvable this way
    }
  }
  return null;
}

/** Whether `file` parses as standard JavaScript: no JSX, no Flow. */
export function isPlainJavaScript(parse: Parse, file: string): boolean {
  try {
    parse(fs.readFileSync(file, "utf8"), {
      sourceType: "unambiguous",
      allowReturnOutsideFunction: true,
      allowAwaitOutsideFunction: true,
    });
    return true;
  } catch {
    return false;
  }
}

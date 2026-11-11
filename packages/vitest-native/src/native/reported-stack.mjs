// The stack of an error the runner reports, naming the files the hot runtime loaded under a
// generation stamp as themselves (docs: hot-default-0.16.md, "one spelling per
// generation").
//
// Inside a worker, Vite's module runner formats `error.stack` from each frame's script URL
// (CallSite.getFileName) and reads that file to apply its source map. An ES module as
// published is loaded under a sibling name per generation (`x.vnhot-N.js`), which is not on
// disk, so its frames named the sibling and its own source map went unread. The runner
// rewrites the errors it reports:
// - a sibling frame names `x.js`, its first line's column less the loader's prologue;
// - mapped through the package's own source map when it ships one, as Vite would have;
// - a `?vnhot=N` frame (a file the hooks compile, which Vite reads and maps) loses only
//   its query.
// `error.stack` read inside the test itself is Vite's and keeps the generation; the
// hot-runtime docs say so.
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { sourcePosition } from "./compile-error.mjs";
import { SIBLING, siblingPrologue, unstamped } from "./generation-stamp.mjs";

// A frame's location: a file URL or path ending in :line:column.
const FRAME = /((?:file:\/\/)?[^\s()]+?):(\d+):(\d+)/g;
const maps = new Map();

/** The package's own source map for `file`, from its last sourceMappingURL, or null. */
function sourceMapOf(file) {
  if (maps.has(file)) return maps.get(file);
  let map = null;
  const source = fs.readFileSync(file, "utf8");
  const comment = [...source.matchAll(/\/\/[#@] sourceMappingURL=(\S+)/g)].at(-1)?.[1];
  if (comment) {
    const inline = /^data:application\/json[^,]*;base64,(.+)$/.exec(comment);
    const text = inline
      ? Buffer.from(inline[1], "base64").toString("utf8")
      : fs.existsSync(path.resolve(path.dirname(file), comment))
        ? fs.readFileSync(path.resolve(path.dirname(file), comment), "utf8")
        : null;
    if (text !== null) {
      try {
        map = {
          map: JSON.parse(text),
          dir: inline
            ? path.dirname(file)
            : path.dirname(path.resolve(path.dirname(file), comment)),
        };
      } catch (error) {
        // A malformed map: the frame keeps the file's own position.
        if (!(error instanceof SyntaxError)) throw error;
      }
    }
  }
  maps.set(file, map);
  return map;
}

/** One frame's location, as the reporter should see it. */
function reportedFrame(location, line, column) {
  const plain = location.replace(/[?#].*$/, "");
  if (!SIBLING.test(plain)) {
    return location === plain ? null : `${unstamped(location)}:${line}:${column}`;
  }
  const realUrl = unstamped(plain);
  const isUrl = realUrl.startsWith("file:");
  const file = isUrl ? fileURLToPath(realUrl) : realUrl;
  if (!fs.existsSync(file)) return null;
  let row = Number(line);
  let col = Number(column);
  if (row === 1) {
    const fileUrl = isUrl ? realUrl : pathToFileURL(file).href;
    col -= siblingPrologue(fileUrl, file, path.dirname(file)).length;
  }
  const owned = sourceMapOf(file);
  const found = owned ? sourcePosition(owned.map, row, col - 1) : null;
  if (found !== null && typeof owned.map.sources?.[found.source] === "string") {
    const source = path.resolve(
      owned.dir,
      owned.map.sourceRoot ?? "",
      owned.map.sources[found.source],
    );
    return `${source}:${found.line}:${found.column + 1}`;
  }
  return `${isUrl ? realUrl : file}:${row}:${col}`;
}

/** `stack` with every generation-stamped frame as the file itself (see above). */
export function reportedStack(stack) {
  if (typeof stack !== "string" || !stack.includes("vnhot")) return stack;
  return stack.replace(FRAME, (whole, location, line, column) =>
    location.includes("vnhot") ? (reportedFrame(location, line, column) ?? whole) : whole,
  );
}

/** Rewrites the stacks of a task's reported errors in place (and their causes). */
export function reportStacksOf(task) {
  for (const error of task?.result?.errors ?? []) {
    for (let current = error, depth = 0; current && depth < 5; current = current.cause, depth++) {
      if (typeof current.stack === "string") current.stack = reportedStack(current.stack);
      if (typeof current.stackStr === "string") current.stackStr = reportedStack(current.stackStr);
    }
  }
}

// Which user file called into the jest-compat shim.
//
// Jest resolves a relative `requireActual('../x')` — and `setMock`/`dontMock` — against
// the CALLING module. These are plain runtime calls on the `jest` global, not rewritten
// at transform time, so there is no import.meta to consult: the stack is the only thing
// that knows the caller.
import path from "node:path";
import { fileURLToPath } from "node:url";

const SHIM_DIR = path.dirname(fileURLToPath(import.meta.url));

/**
 * Whether `file` sits directly in `dir`. Separators and, on Windows, letter case are
 * normalised first: Vite's module runner reports frames as `D:/a/b/setup.mjs`, while a
 * path from `fileURLToPath` is `D:\a\b`, and a plain comparison treated the shim's own
 * frames as the caller there.
 *
 * @param {string} file
 * @param {string} dir
 * @param {typeof path} [pathApi]  injectable for tests of the other platform's rules
 */
export function inDirectory(file, dir, pathApi = path) {
  const normalise = (p) => {
    const resolved = pathApi.resolve(p);
    return pathApi.sep === "\\" ? resolved.toLowerCase() : resolved;
  };
  return normalise(pathApi.dirname(file)) === normalise(dir);
}

/**
 * The file that called into the shim, skipping the shim's own frames (matched by
 * directory: a path substring missed Windows paths and skipped any user file under a
 * `jest-compat/` directory). Null when the stack does not say.
 */
export function callerFile() {
  const original = Error.prepareStackTrace;
  try {
    Error.prepareStackTrace = (_, frames) => frames;
    const frames = new Error().stack;
    for (const frame of frames) {
      const file = typeof frame.getFileName === "function" ? frame.getFileName() : null;
      if (!file || file.startsWith("node:")) continue;
      const filePath = file.startsWith("file://") ? fileURLToPath(file) : file;
      if (inDirectory(filePath, SHIM_DIR)) continue;
      return filePath;
    }
  } catch {
    // The caller is unknown; callers fall back to the project root.
  } finally {
    Error.prepareStackTrace = original;
  }
  return null;
}

// Which spelling of the project root a file path is under.
//
// One directory has several spellings, and files arrive in more than one. Vite's ids come
// from the native real path, which expands a Windows 8.3 short name (RUNNER~1) and gives
// the on-disk letter case. A file Node reaches from a path built on the root as given
// (createRequire of the project's package.json, a test's temporary directory) keeps the
// root's spelling, and the JS realpath keeps it too. A check of "is this file under the
// root" against one spelling misses the files in the others: on Windows, app source that
// Node loaded skipped the project's Babel config. Babel's own root has to be spelled as
// the file is, too, or it does not find the .babelrc files above it.
import fs from "node:fs";
import path from "node:path";

// Windows paths compare without case (a drive letter is `c:` or `C:` as typed).
const fold = process.platform === "win32" ? (p) => p.toLowerCase() : (p) => p;

const spellings = new Map();

const natives = new Map();

/** The distinct spellings of `root`: as resolved, its JS real path, its native real path. */
export function rootSpellings(root) {
  let found = spellings.get(root);
  if (found === undefined) {
    const resolved = path.resolve(root);
    const native = realpathOr(fs.realpathSync.native, resolved);
    found = [...new Set([resolved, realpathOr(fs.realpathSync, resolved), native])];
    spellings.set(root, found);
    natives.set(root, native);
  }
  return found;
}

/**
 * The spelling of `root` that `file` is under (or is), or null when it is outside it. A
 * file spelled unlike any of the root's own (a long name under a root given short, or the
 * other way round) is under the root when its native real path is; the spelling returned
 * is then the file's own leading directories, checked to be the root. Either way it is
 * the root as the file spells it.
 */
export function rootSpellingOf(root, file) {
  const spellingsOfRoot = rootSpellings(root);
  for (const spelling of spellingsOfRoot) {
    // The file's own characters: on Windows the match ignores case, and Babel compares
    // its root with the file name case-sensitively.
    if (under(file, spelling)) return file.slice(0, spelling.length);
  }
  const nativeRoot = natives.get(root);
  if (!under(realpathOr(fs.realpathSync.native, file), nativeRoot)) return null;
  const depth = nativeRoot.split(path.sep).length;
  const own = file.split(path.sep).slice(0, depth).join(path.sep);
  return realpathOr(fs.realpathSync.native, own) === nativeRoot ? own : null;
}

/**
 * Whether `file` is `dir` or under it, comparing the strings as they are (without case on
 * Windows). For a caller that spelled its directories once with `rootSpellings`, so each
 * check costs no file-system call.
 */
export function under(file, dir) {
  const target = slashes(fold(file));
  const prefix = slashes(fold(dir)).replace(/\/+$/, "");
  return target === prefix || target.startsWith(`${prefix}/`);
}

// On Windows `/` and `\` are both separators, and paths arrive with either.
const slashes = process.platform === "win32" ? (p) => p.replace(/\\/g, "/") : (p) => p;

/** `file` relative to `root`, in whichever spelling of the root it is under. */
export function relativeToRoot(root, file) {
  const spelling = rootSpellingOf(root, file);
  return spelling === null
    ? path.relative(root, file)
    : file.slice(spelling.length).replace(/^[\\/]/, "");
}

function realpathOr(realpath, file) {
  try {
    return realpath(file);
  } catch {
    return file;
  }
}

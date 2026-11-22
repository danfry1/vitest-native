/**
 * What vitest-native's early load hooks (projectBabel's and loadProjectJsx's) read of a
 * project source id. They run ahead of every normal-order plugin's load (the plugin is
 * `enforce: "pre"`). So an id spelled as an absolute path under the root, with a source
 * extension, can still name no file: a virtual module that a later plugin serves, such as
 * jest-compat's `<root>/vitest-native.root-mocks.mjs` or a third-party plugin's. Such an
 * id is not theirs to compile: they answer nothing, and the chain serves it.
 */
import fs from "node:fs";

/** Read errors meaning the path names no regular file. Any other error is real. */
const NOT_A_FILE = new Set(["ENOENT", "ENOTDIR", "EISDIR"]);

/** The file's text, or null when the id names no file on disk. */
export async function readProjectSource(id: string): Promise<string | null> {
  try {
    return await fs.promises.readFile(id, "utf8");
  } catch (error) {
    if (NOT_A_FILE.has((error as NodeJS.ErrnoException).code ?? "")) return null;
    throw error;
  }
}

/** Whether the id names a regular file on disk: the same answer as readProjectSource. */
export function isProjectSourceOnDisk(id: string): boolean {
  return fs.statSync(id, { throwIfNoEntry: false })?.isFile() ?? false;
}

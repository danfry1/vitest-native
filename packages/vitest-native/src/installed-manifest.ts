/**
 * A package's manifest as the package manager wrote it (see cli/manifest.ts for why
 * this reads the file instead of resolving it).
 */
import fs from "node:fs";
import path from "node:path";

/** A package's manifest, found by walking node_modules upward from root, or null. */
export function installedManifest(root: string, pkg: string): Record<string, unknown> | null {
  for (let dir = path.resolve(root); ; dir = path.dirname(dir)) {
    const file = path.join(dir, "node_modules", pkg, "package.json");
    if (fs.existsSync(file)) {
      try {
        return JSON.parse(fs.readFileSync(file, "utf8")) as Record<string, unknown>;
      } catch {
        return null;
      }
    }
    if (path.dirname(dir) === dir) return null;
  }
}

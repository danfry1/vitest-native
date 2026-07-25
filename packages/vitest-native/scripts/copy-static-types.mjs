// Hand-written declaration files have nothing to compile, so tsdown has no entry for
// them. Copy them into dist after the bundle so the exports map can point at them.
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const STATIC_TYPES = ["rntl-matchers.d.ts"];

for (const name of STATIC_TYPES) {
  const from = path.join(root, "src", name);
  const to = path.join(root, "dist", name);
  if (!fs.existsSync(from)) throw new Error(`[copy-static-types] missing source: ${from}`);
  fs.copyFileSync(from, to);
}

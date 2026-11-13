// Global setup: writes the generated graph before any worker starts. Each slice is a chain
// of DEPTH project modules (s<N>m0 imports s<N>m1, and so on); every module also imports an
// installed package and a builtin, and each slice's root registers with the shared store.
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

export const SLICES = 16;
export const DEPTH = 24;

export default function writeGraph(): void {
  const here = path.dirname(fileURLToPath(import.meta.url));
  const dir = path.join(here, "packages/validator/src/gen");
  fs.mkdirSync(dir, { recursive: true });
  for (let slice = 0; slice < SLICES; slice++) {
    for (let i = 0; i < DEPTH; i++) {
      const next = i + 1 < DEPTH ? `s${slice}m${i + 1}` : null;
      const source = [
        `import { create } from "react-test-renderer";`,
        `import { sep } from "node:path";`,
        ...(next ? [`import { depth as below } from "./${next}";`] : []),
        ...(i === 0 ? [`import { store } from "../shared";`, `store.slices.push(${slice});`] : []),
        `export const depth = 1${next ? " + below" : ""};`,
        `export const token = { slice: ${slice}, module: ${i} };`,
        ...(i === 0 ? [`export { store };`] : []),
        `export const used = [typeof create, sep];`,
      ].join("\n");
      fs.writeFileSync(path.join(dir, `s${slice}m${i}.ts`), `${source}\n`);
    }
  }
}

// Writes the generated graph: 150 project modules as a binary tree (m0 imports m1 and m2,
// and so on), each also importing an installed package and a builtin. Idempotent, so
// every test file can call it before anything imports the graph.
import { randomUUID } from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { threadId } from "node:worker_threads";

export const MODULES = 150;
export function writeGraph(): void {
  const dir = path.join(process.cwd(), "packages/validator/src/gen");
  fs.mkdirSync(dir, { recursive: true });
  for (let i = 0; i < MODULES; i++) {
    const children = [2 * i + 1, 2 * i + 2].filter((child) => child < MODULES);
    const file = path.join(dir, `m${i}.ts`);
    const source = [
      `import { create } from "react-test-renderer";`,
      `import { sep } from "node:path";`,
      ...children.map((child) => `import { size as s${child} } from "./m${child}";`),
      `export const size = 1 ${children.map((child) => `+ s${child}`).join(" ")};`,
      `export const used = [typeof create, sep];`,
    ].join("\n");
    // Both test files write the graph, in parallel workers (threads of one process): each
    // file is written whole to a file of its own and renamed into place, so a reader never
    // sees a truncated module.
    if (!fs.existsSync(file) || fs.readFileSync(file, "utf8") !== source) {
      const partial = `${file}.${process.pid}.${threadId}.${randomUUID()}.tmp`;
      fs.writeFileSync(partial, source);
      fs.renameSync(partial, file);
    }
  }
}

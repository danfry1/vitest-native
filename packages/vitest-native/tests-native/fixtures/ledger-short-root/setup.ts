// Before any test file imports it, Node loads the store from a path built on the project
// root as given (the run's working directory), so Node's copy is first and Vite's second.
import { createRequire } from "node:module";
import path from "node:path";

(globalThis as { viaNode?: unknown }).viaNode = createRequire(
  path.join(process.cwd(), "package.json"),
)("./src/store.ts");

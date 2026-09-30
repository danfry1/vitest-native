const { TestRunner } = await import(process.env.VN_UPSTREAM_VITEST_ENTRY ?? "vitest");

const VITEST_RUNTIME = [/\/vitest\/dist\//, /vitest-virtual-\w+\/dist/, /@vitest\/dist/];
const PRESERVED_ACTUAL = /\/resident-(?:actual|flaky)\.mjs$/;

async function preservedClosure(modules) {
  const preserved = new Set();
  const seeds = [];

  for (const [id, node] of modules.idToModuleMap) {
    if (PRESERVED_ACTUAL.test(id) && node.evaluated && node.promise) seeds.push(id);
  }

  for (const seed of seeds) {
    const closure = new Set();
    const pending = [seed];
    let coherent = true;
    while (pending.length) {
      const id = pending.pop();
      if (closure.has(id)) continue;
      const node = modules.idToModuleMap.get(id);
      if (id.startsWith("mock:") || !node?.evaluated || !node.promise) {
        coherent = false;
        break;
      }
      closure.add(id);
      pending.push(...node.imports);
    }
    if (!coherent) continue;
    const results = await Promise.allSettled(
      [...closure].map((id) => modules.idToModuleMap.get(id).promise),
    );
    if (results.some((result) => result.status === "rejected")) continue;
    for (const id of closure) preserved.add(id);
  }

  return preserved;
}

export default class SelectiveActualRunner extends TestRunner {
  async onBeforeCollect(paths) {
    const modules = globalThis.__vitest_worker__?.evaluatedModules;
    globalThis.__vitest_mocker__?.reset?.();

    if (modules) {
      const preserved = await preservedClosure(modules);
      for (const [id, node] of modules.idToModuleMap) {
        if (VITEST_RUNTIME.some((pattern) => pattern.test(id))) continue;
        if (preserved.has(id)) {
          for (const importer of node.importers) {
            if (!preserved.has(importer)) node.importers.delete(importer);
          }
          continue;
        }
        node.promise = undefined;
        node.exports = undefined;
        node.evaluated = false;
        node.importers.clear();
      }
    }

    return super.onBeforeCollect?.(paths);
  }
}

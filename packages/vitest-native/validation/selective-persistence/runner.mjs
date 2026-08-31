import { TestRunner } from "vitest";

const VITEST_RUNTIME = [/\/vitest\/dist\//, /vitest-virtual-\w+\/dist/, /@vitest\/dist/];
const RN_CAPSULE = /vitest-native:single-graph-rn-capsule/;

/**
 * Experiment-only selective isolation.
 *
 * Vitest's scheduler runs with isolate:false so the worker and its evaluated
 * module graph survive. Before each file, this performs Vitest's ordinary mock
 * reset and evaluated-node reset except for the RN CommonJS capsule. App, test,
 * setup and RNTL modules therefore re-evaluate while the expensive RN actual
 * layer retains one identity.
 */
export default class SelectivePersistenceRunner extends TestRunner {
  async onBeforeCollect(paths) {
    const state = globalThis.__vitest_worker__;
    const modules = state?.evaluatedModules;
    globalThis.__vitest_mocker__?.reset?.();

    if (modules) {
      for (const [id, node] of modules.idToModuleMap) {
        if (VITEST_RUNTIME.some((pattern) => pattern.test(id))) continue;
        if (RN_CAPSULE.test(id)) {
          // Old resettable importers must not become a retention chain hanging
          // off the preserved actual module.
          node.importers.clear();
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

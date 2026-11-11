// The test runner both engines use (wired as `test.runner` unless the project sets its
// own): Vitest's own TestRunner, with one change. A setup or test file whose import
// fails because a module did not compile reports where (compile-error.mjs). The hot
// runtime's runner (runner.mjs) extends this one.
import * as vitest from "vitest";
import { withCompileLocation } from "./compile-error.mjs";
import { reportStacksOf } from "./reported-stack.mjs";

export default class NativeTestRunner extends vitest.TestRunner {
  async importFile(filepath, source) {
    try {
      return await super.importFile(filepath, source);
    } catch (error) {
      throw withCompileLocation(error, (file) => this.vitestNativeSourceMap(file));
    }
  }

  // A reported error names the files the hot runtime loaded under a generation stamp as
  // themselves, source-mapped as Vite would have (reported-stack.mjs).
  onAfterRunTask(task) {
    reportStacksOf(task);
    return super.onAfterRunTask?.(task);
  }

  onAfterRunSuite(suite) {
    reportStacksOf(suite);
    return super.onAfterRunSuite?.(suite);
  }

  /** The sourcemap Vite's module runner holds for the module compiled from `file`. */
  vitestNativeSourceMap(file) {
    const modules = this.moduleRunner?.evaluatedModules;
    for (const node of modules?.getModulesByFile?.(file) ?? []) {
      const map = modules.getModuleSourceMapById?.(node.id)?.map;
      if (map) return map;
    }
    return null;
  }
}

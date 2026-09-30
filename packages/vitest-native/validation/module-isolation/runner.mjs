import { TestRunner } from "vitest";

export default class NativeModuleIsolationRunner extends TestRunner {
  async onBeforeRunFiles(files) {
    globalThis.__vitest_native_hot_bless?.();
    return super.onBeforeRunFiles?.(files);
  }
}

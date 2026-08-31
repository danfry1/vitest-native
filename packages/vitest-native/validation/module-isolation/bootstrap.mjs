// Runs before vitest-native's native setup. The marker makes that setup install
// its hot ESM generation buffer on the first file; the real reset is installed by
// install-hot-after-setup.mjs once RN and the native boundary exist.
if (!globalThis.__vitest_native_hot_reset) {
  globalThis.__vitest_native_hot_reset = () => {};
  globalThis.__vitest_native_module_mode_bootstrap = true;
}

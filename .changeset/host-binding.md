---
"vitest-native": patch
---

vitest-native now takes the Vite and Vitest versions from the instances that are running, not from the packages named `vite` and `vitest` found from the project root. Under Vite+, whose `vite` package is a wrapper's core reporting its own version, every run used to stop at startup with "requires vite >= 6.4.2, but found 1.3.0"; and a pnpm project that gets `vitest` through Vite+ rather than its own install failed with "vitest … was not found". Both now start, and `doctor` reports the bundled Vite. The JSX transform and Expo's tsconfig-paths decision follow the running Vite too.

When vitest-native's own import of `vitest` would reach a different physical copy from the one running, the run now stops with `VITEST_TWIN_INSTANCE`, naming both copies, instead of every test file failing. The check asks the host what it loads: the project's Vite resolver for the setup file, which maps to the running copy in an ordinary install even when two copies of the same version are present, and Node for the hot runtime's worker. A project with two copies and the hot runtime turned on is told to deduplicate the install or set `hotRuntime: false`.

`vitest-native init` writes a `vite.config.ts` with `defineConfig` from `'vite-plus'` when vite-plus is installed, and points to `vp test`. `vitest-native migrate` suggests the same shape, and `init` leaves an existing Vite+ config in place and shows the lines to add to it.

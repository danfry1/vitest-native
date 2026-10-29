---
"vitest-native": patch
---

**Vite+ projects start, and two copies of Vitest fail by name.** vitest-native now reads the Vite and Vitest versions from the instances that are running, not from the `vite` and `vitest` packages found from the project root. No action needed for an ordinary install.

- Under Vite+, whose `vite` package reports Vite+'s own version, runs no longer stop with `UNSUPPORTED_PEER` ("requires vite >= 6.4.2 … found 1.3.0"). A pnpm project that gets `vitest` only through Vite+ no longer fails with "vitest … was not found". `doctor` reports the Vite actually in use. The JSX transform and Expo's tsconfig `paths` support follow the running Vite.
- When vitest-native would load a different physical copy of Vitest from the one running, the run stops at startup with `VITEST_TWIN_INSTANCE`, naming both paths, instead of every test file failing. Two copies of the same version in an ordinary install are not an error, because Vitest's resolver maps them to the running copy. To fix it, install one Vitest that both resolve: remove the project's own `vitest` when Vite+ provides it, or deduplicate the install. When the error comes from the hot runtime's worker, `hotRuntime: false` also works.
- `vitest-native init` with vite-plus installed writes `vite.config.ts` using `defineConfig` from `'vite-plus'` and points to `vp test`. When a Vite+ config already exists, it shows the lines to add instead of offering `--force`. `migrate` suggests the same shape.
- Vitest 2 and 3 still fail at startup with `UNSUPPORTED_PEER`.

Not covered yet: under the hot runtime, a project with two physical copies of Vitest is refused rather than bound to the running copy.

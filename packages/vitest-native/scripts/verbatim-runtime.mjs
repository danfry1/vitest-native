// The runtime files the build ships VERBATIM rather than bundled: every .mjs and
// hand-written .d.mts in these source directories, copied to the same place under
// dist/. Node loads them by relative path at runtime (the native engine's loader
// hooks, jest-compat's setup and alias targets), so no bundle entry reaches them.
//
// Shared by tsdown.config.ts (which copies them) and scripts/check-package-size.mjs
// (which requires them in the published artifact), so the one exception below is
// stated once.
export const VERBATIM_DIRS = ["", "native", "jest-compat"];

/**
 * Copied by nothing. The memory planner is a config/doctor build-time module that
 * tsdown already emits as an internal code-split chunk; it is not loaded verbatim by
 * Node's hooks, so copying it again would publish two unreachable files.
 */
export const NOT_COPIED_VERBATIM = ["native/memory.mjs", "native/memory.d.mts"];

/** Whether `file` in `dir` (one of VERBATIM_DIRS) ships verbatim. */
export function isVerbatimRuntimeFile(dir, file) {
  if (!file.endsWith(".mjs") && !file.endsWith(".d.mts")) return false;
  return !NOT_COPIED_VERBATIM.includes(dir ? `${dir}/${file}` : file);
}

globalThis.__selective_repro_flaky_evaluations =
  (globalThis.__selective_repro_flaky_evaluations ?? 0) + 1;

if (globalThis.__selective_repro_fail_flaky) {
  globalThis.__selective_repro_fail_flaky = false;
  throw new Error("intentional first evaluation failure");
}

export const evaluation = globalThis.__selective_repro_flaky_evaluations;

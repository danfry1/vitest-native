# Architecture decision records

Each record states one decision about how vitest-native works, why, and what it
costs. "ADR 0004" in code, comments or the contributor guide means every record
numbered `0004-*`. Numbers and letters missing below belong to decisions that
were proposed or retired and are not recorded here.

New records start from [TEMPLATE.md](TEMPLATE.md).

## Rules

1. **One decision per record.** A record that bundles several decisions is split.
2. **Accepted records are immutable** apart from Status, Implemented and
   Enforced by. Changing a decision means writing a new record that supersedes
   the old one.
3. **"Implemented" says what is true on `main` today.** `tests/adr-records.test.ts`
   fails if an "Enforced by" path doesn't exist.
4. **Evidence, prototypes, measurements and revision history are kept
   outside this repository.** A record states the conclusion and the
   number that decided it, never the lab notebook.
5. **Public by default.** No private teams, users, repositories or local
   paths. Public open-source projects used as test subjects may be named.
6. **Keep each record under about 80 lines.** If it's longer, it's more than
   one decision, or it contains evidence.

## Records

| Record | Decision | Implemented |
| --- | --- | --- |
| [0001-a](0001-a-build-in-place.md) | Build the target architecture inside the current runtime, one layer at a time | Yes |
| [0001-b](0001-b-capped-flag-table.md) | Ship behaviour changes as entries in one capped, dated flag table | Partly |
| [0001-c](0001-c-runtime-core-spike.md) | Build the runtime core only if a throwaway spike beats the in-place baseline | No |
| [0002-a](0002-a-counts-gate-timing-tripwire.md) | Gate on deterministic counts against fixed anchors; treat timings as tripwires | Partly |
| [0002-b](0002-b-bug-museum.md) | Keep a runnable exhibit for every real bug and run them all in CI | Yes |
| [0002-c](0002-c-rules-as-tests.md) | Enforce the delivery rules with tests, not prose | Partly |
| [0002-d](0002-d-structural-scorecard.md) | Ratchet a structural scorecard so the risky-pattern count never rises | Partly |
| [0002-e](0002-e-compare-modes.md) | Compare candidates against Jest, the previous release and the fixed anchors | Partly |
| [0002-f](0002-f-config-axis-matrix.md) | Vary configuration axes in an advisory matrix until it is calibrated | Partly |
| [0003-a](0003-a-project-context-file.md) | Pass each project's configuration to workers as one validated context file | Yes |
| [0003-b](0003-b-single-global-handle.md) | Expose worker state through one frozen global handle | Partly |
| [0004-a](0004-a-owner-per-package.md) | Decide each module's owner per package, before resolution, with a total predicate | Partly |
| [0004-b](0004-b-ownership-ledger.md) | Report any file evaluated by both module systems, as a warning for users and an error in CI | Partly |
| [0005-a](0005-a-shared-resolver.md) | Resolve for Vite, Node's require and the ESM loader through one resolver with a worker-lifetime cache | Partly |
| [0005-b](0005-b-aliases-both-sides.md) | Apply aliases on both sides, for every requester, as Jest's moduleNameMapper does | Partly |
| [0005-c](0005-c-internal-field-policy.md) | Keep the main-field policy internal: the react-native field by default, with per-package deviations | Partly |
| [0006-a](0006-a-compile-verdict.md) | Compile an installed file only when it fails to parse as a CommonJS script | Partly |
| [0006-b](0006-b-flow-capable-always-compile.md) | Always compile TypeScript, Flow and react-native-field files, without a parse check | Partly |
| [0006-c](0006-c-transform-cache-key.md) | Key the transform cache on babel-jest's inputs plus the source path, .env files and React Native extras | Partly |
| [0006-d](0006-d-prebuilt-rn-registry.md) | Prebuild React Native locally into a registry compiled with its own preset | Yes |
| [0007-a](0007-a-one-node-dispatcher.md) | Route Node's CommonJS hooks through one dispatcher of ranked steps | Partly |
| [0007-b](0007-b-keep-node-require-precedence.md) | Keep today's require precedence: per-file mock, then preset, then registry, then Node | Partly |
| [0008-a](0008-a-small-resident-renderer-set.md) | Keep only React, scheduler, react-is and the installed renderer resident across files | Partly |
| [0008-b](0008-b-retire-unusable-resident-workers.md) | Retire a worker whose resident React is unusable; when it cannot be retired, fail later files by name | Partly |
| [0008-c](0008-c-account-for-every-file.md) | Every file the hot runtime is given comes back with a result | Yes |
| [0008-d](0008-d-fail-on-mocks-of-resident-modules.md) | A mock of a resident module fails loudly in reuse modes | No |
| [0011-a](0011-a-two-environment-install-groups.md) | Install the test environment in two groups: once at worker boot, and per file before user setup | Partly |
| [0011-b](0011-b-environment-catalog-as-code.md) | Keep the Jest-like environment as a catalog of install functions, each with one probe | No |
| [0011-c](0011-c-scoped-jest-for-library-support.md) | Give a library's own test-support files a `jest` of their own, never a global one | Yes |
| [0011-d](0011-d-rntl-adapter.md) | Give RNTL its Jest-only environment, bound to the current file, through one adapter | Yes |
| [0012-a](0012-a-mock-only-at-native-boundary.md) | Mock only at the native boundary, a strict subset of React Native's Jest setup | Yes |
| [0012-b](0012-b-library-own-test-support-first.md) | Use each library's own test support first; hand-written presets only as drift-gated fallbacks | Partly |
| [0012-c](0012-c-library-mock-cost-in-stages.md) | Fix the cost of libraries' own mocks in stages, cheapest first, against a bar stated in counts | Partly |
| [0013-a](0013-a-per-file-esm-generation.md) | Re-evaluate true ES modules per test file by stamping a generation on their URL | Yes |
| [0013-b](0013-b-one-esm-interop-policy.md) | Use one interop policy, decided when the default is read, for ES modules compiled to CommonJS | Yes |
| [0013-c](0013-c-loaders-decide-nothing-per-file.md) | Keep the module loaders free of per-file decisions | Yes |
| [0014-a](0014-a-admit-hot-only-when-recyclable.md) | Admit the hot runtime only when workers can be recycled between files, and never decline silently | Yes |
| [0014-c](0014-c-fix-retainers-by-name.md) | Fix per-file memory growth at the named retainer, and keep resident mocks free of per-file values | Yes |
| [0014-d](0014-d-matcher-registry-flag-only.md) | Install a world-keyed matcher registry only under per-file worlds, never on the default path | No |
| [0015-a](0015-a-keep-mock-engine-frozen-scope.md) | Keep the mock engine for projects without a React Native toolchain, with its scope frozen | Yes |
| [0015-b](0015-b-mock-engine-cross-check-floor.md) | Hold the mock engine to real React Native with a cross-check whose probe count may not fall | Yes |
| [0016-a](0016-a-one-flag-table.md) | Put every temporary behaviour change under `experimental`, in one flag table | Partly |
| [0016-c](0016-c-collapse-hot-runtime-options.md) | Collapse the `hotRuntime` sub-options once resident-core recovery lands | No |
| [0016-d](0016-d-public-option-surface.md) | Add a public option only through a decision record, and remove a stable one only in a major | Partly |
| [0017-a](0017-a-no-strict-tier-fresh-react-only-whole.md) | Build no separate strict isolation tier; re-run React per file only when every consumer gets the file's React | Yes |
| [0017-c](0017-c-product-scope-non-goals.md) | Keep these product non-goals until their reopen condition is met | Yes |
| [0017-d](0017-d-engineering-limits.md) | Hold these engineering limits: two runtime dependencies, two live flags, no unrun gates, no silent fallbacks | Yes |

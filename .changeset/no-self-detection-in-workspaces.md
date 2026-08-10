---
"vitest-native": patch
---

Never treat the package under test as an ecosystem dependency

Under `engine: 'native'` in a workspace, a test file's own
`import { describe, it, expect } from 'vitest'` could fail to load with:

```
Error: Vitest cannot be imported in a CommonJS module using require().
Test Files 1 failed | Tests: no tests
```

Auto-detection reads the manifests of every workspace member, so the package under
test appears in the candidate set whenever a sibling — or the repository root —
declares it as a dependency. It also declares React Native, because it *is* React
Native code, so it was detected as a third-party ecosystem package: its directory
became a `server.deps.external` pattern, Vitest handed every file beneath it to Node,
and the loader compiled them to CommonJS. A test file's `import` then became
`require('vitest')`, which throws before a single test runs. Suites using Vitest
globals instead reported a pass while still running through Node's graph.

Because it depended on whether anything happened to declare the package, the failure
appeared in one workspace package and not another with an identical config, and was
easy to misattribute to the `react-native` export condition selecting a CommonJS build
of some dependency. It reproduces with no such dependency in the graph.

Two changes:

- A package whose directory contains the run root is the project, not a dependency,
  and is excluded from detection — including when a detected sibling's dependency
  closure reaches it. Workspace libraries the project merely depends on are still
  detected, which is what keeps them to a single module instance.
- A first-party test file is never externalized, even when it sits inside a workspace
  library that is legitimately detected — the case an Nx-style run from the repository
  root produces. Test entries belong to Vitest, not to Node.

The consumer suite now runs the workspace library's own tests, from inside the package
and from the workspace root, and the whole monorepo fixture is exercised under pnpm as
well as npm.

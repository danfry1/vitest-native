---
"vitest-native": patch
---

Auto-detection sees workspace members, so running from a monorepo root works

Package auto-detection walked manifests upwards from the run root. In a workspace the
run root is frequently *above* the package under test — Nx invokes tasks from the
workspace root, and Vitest's root follows the working directory — so the app's own
dependencies live in a manifest that walking up never reaches.

A workspace library therefore missed detection, stayed in Vite's graph while Node
loaded it too, and came apart into two module instances with separate module-level
state. Reproduced in a pnpm workspace: the same config and the same code passed from
the app directory and failed from the workspace root, with state written through one
graph reading back unset through the other.

Detection now also reads the manifests of workspace members declared by any manifest
it finds, including pnpm's separate `pnpm-workspace.yaml` list, and resolves each
candidate from whichever of those directories can see it — necessary under pnpm,
where a workspace package is linked only into the package that depends on it.

The consumer gate now runs the monorepo fixture from the workspace root as well as
from the app directory, so the invocation that exposed this is covered rather than
assumed.

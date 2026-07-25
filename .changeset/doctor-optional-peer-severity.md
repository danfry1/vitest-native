---
"vitest-native": patch
---

`doctor` no longer reports a blocking problem for an optional peer it does not block on

A `@testing-library/react-native` version outside the supported range made `doctor`
print "Blocking problems found" and exit non-zero. The plugin does not block on it —
RNTL is an optional peer, and a version outside the range is a `console.warn` there
— so a project that runs its tests fine could still fail a `doctor` check. It is now
reported as a warning, matching what actually happens at run time. The genuine
blocker in that area is unchanged: RNTL 14 on a Node below 22.13 still fails, because
RNTL 14 declares `engines: ^22.13.0 || >=24`.

The supported range was also written three times — in this package's
`peerDependencies`, in the plugin's startup check, and again as a hardcoded major
comparison inside `doctor` — with nothing holding them together. It now comes from
the same table the other peers use, and a test asserts that table against the
published `peerDependencies` so the two cannot drift apart.

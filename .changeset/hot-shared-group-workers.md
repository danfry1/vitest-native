---
"vitest-native": patch
---

Fix multi-project runs failing when a native project uses the hot runtime

Vitest runs projects that share a `sequence.groupOrder` (0 unless set) as one group, and stops
the run when they resolve to different `maxWorkers` ("Projects … have different 'maxWorkers'
but same 'sequence.groupOrder'"). The hot runtime's memory plan caps workers at four, while a
project beside it, such as a mock-engine or non-React-Native project, gets Vitest's default of one
fewer than the CPUs. So a config with a native project and another project failed on any machine
with more than five cores. `hotRuntime: 'auto'` now keeps Vitest's isolation and worker count for
that project and says why. An explicit `hotRuntime: true` fails with `HOT_RUNTIME_OVERRIDDEN`,
because a distinct `test.sequence.groupOrder` is what lets the two run as separate groups.

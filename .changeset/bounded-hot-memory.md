---
"vitest-native": patch
---

Bound the native hot runtime by effective host/container memory

Hot mode now derives one worker-total plan from `os.totalmem()` and
`process.constrainedMemory()`, reserves main-process and worker-replacement RSS,
caps automatic concurrency at four, and recycles one worker at a time on local heap
or process RSS. It fails before starting more work at the hard RSS boundary so a
container reports a useful `HOT_MEMORY_BUDGET_EXCEEDED` error instead of relying on
an OOM kill.

Current Vitest batches every file into one unrecyclable task at one worker. Hot mode
now rejects that configuration with `HOT_MEMORY_UNBOUNDED` rather than silently
claiming its limits are active. An externally bounded run can explicitly accept the
risk with `hotRuntime: { allowUnboundedMemory: true }`.

The policy is covered by unit and recycle-soak gates plus a packed RN 0.87 / RNTL 14
Docker gate: 512 MiB and 1 GiB fail closed before registry compilation, while 2 GiB
caps an eight-worker request to four, passes 405 files, and demonstrably recycles.

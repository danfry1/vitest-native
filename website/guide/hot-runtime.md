# Hot Runtime

By default the native engine runs each test file in a fresh worker, so React Native loads again for every file. The **hot runtime** keeps workers alive across test files instead: React Native loads once per worker, while every file still gets fresh app and test modules, mocks and timers.

It is opt-in and experimental. It uses Vitest's custom worker APIs, which Vitest labels experimental, and it has [known differences](#known-differences) from per-file isolation.

::: tip Should I turn it on?
Try it when a suite is large enough that loading React Native in every file takes a noticeable share of the run. Run the suite both ways, with `hotRuntime: false` and with `hotRuntime: 'auto'`, and compare the results and the time. Keep it only if every test gives the same result both ways and it is faster on your suite. Whether it is faster depends on the suite.
:::

## Turning it on

```ts
reactNative({ hotRuntime: 'auto' })  // hot where the run can be bounded, per-file isolation otherwise
reactNative({ hotRuntime: true })    // require it; fail at startup where it cannot run
reactNative({ hotRuntime: false })   // the default: a fresh worker per file
```

The [`hotRuntime` option](/guide/plugin-options#hotruntime) lists every value and the object form's keys. The engine banner at the start of a run says `hot runtime` when it is on (unless a following `hot runtime off: …` line names why it was turned off), and the startup log names the worker count it chose, for example:

```
[vitest-native] workers: 4 (automatic cap of 4; 9 available, set maxWorkers to run more; 24576 MiB host memory)
```

## When `'auto'` falls back

`'auto'` uses the hot runtime only where it can bound memory and recycle workers between files, and otherwise keeps per-file isolation and prints why. It falls back when:

- the run has one worker (`maxWorkers: 1`, `--maxWorkers=1`, `--no-file-parallelism`, or a memory plan that admits only one), because Vitest then runs every file as one task and a worker cannot be recycled between them;
- the config or the command line chooses a pool or isolation explicitly (`pool`, `test.isolate`, `--pool`, `--isolate`, `--no-isolate`). An explicit choice is always kept;
- another project in the same `sequence.groupOrder` runs a different worker count, which Vitest does not allow. Give the native project its own `test.sequence.groupOrder` to keep the hot runtime;
- the hot worker would load a different Vitest version from the one running the tests.

With `hotRuntime: true` these fail at startup instead: a one-worker config (`maxWorkers: 1`, `fileParallelism: false`) or memory plan with `HOT_MEMORY_UNBOUNDED`; a one-worker CLI flag or `VITEST_MAX_WORKERS=1`, an explicit pool or isolation, or a `groupOrder` clash with `HOT_RUNTIME_OVERRIDDEN`; a different Vitest version with `HOT_RUNTIME_UNAVAILABLE`.

Suites migrated from Jest with the [jest-compat layer](/guide/jest-compat) are included: `jest.mock` in its forms, runtime mocks, spies, timers and React Native Testing Library's cleanup are reset between files.

## Known differences

Workers stay alive, and some state is known to carry over from one file to the next. Each case can change a test's result depending on which files ran before it in the same worker:

- generated `useId` values continue from the previous file;
- React shows a development warning once per worker, not once per file;
- an `act()` scope left open stays open for the worker;
- fake timers active when React first loads stay captured by React's scheduler;
- RNTL reinstalls fake timers only in the first file that loads it;
- an environment variable a module sets when it is imported is set only in the first file on a worker that imports it (RNTL's `dont-cleanup-after-each` is handled).
- a `jest.mock` or `vi.mock` does not reach the requires React, its renderers, `scheduler` and RNTL make themselves; the test file's own code still gets the mock. Under Jest and per-file isolation these packages load again in every file and see its mocks, so in a file that mocks `react-native`, RNTL's own uses of it (`StyleSheet.flatten` in `fireEvent`, say) see the real module under hot and the mock elsewhere. Serving them the mock would keep it for every later file on the worker. `hotRuntime: { freshRuntime: true }` loads them in every file, so they see the file's mocks as under Jest.
- a property a library defines on `globalThis` as non-configurable, such as the provider registry the `openai` SDK defines once per process, stays for the worker's life, because nothing can delete it. Every other global a file adds is deleted before the next file, and `reactNative({ diagnostics: true })` names each property kept this way.

With `hotRuntime: { freshRuntime: true }` (experimental), React, its renderers, `scheduler` and React Native Testing Library run again for every file, so the first five of these no longer apply: each file counts `useId` from the start, sees React's warnings, renders outside any `act()` scope an earlier file left open, loads the scheduler under its own timers, and has RNTL reinstall fake timers. It costs re-running those packages, about 5 ms per file with four workers and 17 ms with one, measured on a 135-file suite. A worker also holds a few earlier copies of React at a time, about 18 MB more heap than without the option in one measurement; it does not grow with the number of files, and worker recycling (`memoryLimit`, `recycleAfterFiles`) bounds it as usual.

vitest-native's presets build their mocks with each file's React. A [preset of your own](/guide/presets#your-own-presets) whose factory makes components, contexts or hooks should do the same, using the React the factory is given rather than one imported at the module's top level, which keeps the first file's copy:

```ts
'my-lib': {
  exports: ['ThingView'],
  factory: ({ React }) => ({
    ThingView: (props) => React.createElement('ThingView', props),
  }),
},
```

[Troubleshooting](/guide/troubleshooting#a-test-passes-on-its-own-but-fails-when-run-with-other-files) describes each one and how to confirm it. Beyond these, vitest-native cannot discover every piece of state a third-party library keeps for the life of a process. A test that passes on its own but fails after other files is the sign: set `hotRuntime: false` for that suite, and [report it](https://github.com/danfry1/vitest-native/issues) with the library involved.

## Workers and memory

The hot runtime plans its workers from the lower of the host's and the container's memory (it reads cgroup limits). It reserves headroom for the main process and for replacing workers, recycles a worker when its heap or the process's memory grows past its share, and stops before starting more work at a hard memory limit (`HOT_MEMORY_BUDGET_EXCEEDED`).

- **Worker count.** The count it picks itself is capped at four: in the measurement behind that cap, eight workers were about 6% faster than four for about 512 MiB more peak memory. A count you set (`test.maxWorkers`, `--maxWorkers` or `VITEST_MAX_WORKERS`) is honoured up to what the memory plan admits, so set one to run more than four. Where no memory limit can be read, the cap of four applies to an explicit count too.
- **The full plan** (limits, reserves and the heap threshold) is printed with `reactNative({ diagnostics: true })` or by `vitest-native doctor`.
- **Your own threshold.** `hotRuntime: { mode: 'auto', memoryLimit }` (bytes) sets the heap at which a worker is recycled and keeps `'auto'`'s fallback; without `mode`, an object requires the hot runtime. The heap a worker reports is read when its file finishes, before garbage collection, so it can sit above what the worker really retains: leave headroom.
- **One worker.** Recycling needs two or more workers, so use `maxWorkers` of 2 or more. If something outside the run already bounds its memory, `hotRuntime: { allowUnboundedMemory: true }` accepts a single-worker run; it also turns off the automatic worker cap, recycling on process memory and the memory hard stop, and warns when Vitest batches the files into one task.

## Caches

Under the native engine, vitest-native turns on Node's on-disk compile cache (`node_modules/.cache/vitest-native/v8`), so React Native's compiled code is reused by later workers and runs. Hot workers leave it off while `esmGeneration` is on, which is the default: each test file re-runs the packages Node loads for its `import`s, and the cache would keep one entry per package per file. Leaving it off costs about 15–20 ms per hot worker start, including each recycle, in one measured project. With `hotRuntime: { esmGeneration: false }` hot workers keep the cache, and packages loaded that way keep their state across files.

If you set `NODE_COMPILE_CACHE` yourself, Node turns the cache on in every worker before vitest-native runs, and hot workers then write those per-file entries again; unset it for hot runs, or set `esmGeneration: false`.

React Native's own compiled modules are cached separately; [troubleshooting](/guide/troubleshooting#when-react-native-s-precompiled-modules-are-reused-or-rebuilt) says where and when they are rebuilt.

Next: [Choosing an Engine](/guide/engines).

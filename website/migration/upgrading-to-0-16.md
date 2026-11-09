# Upgrading to 0.16

## The hot runtime is on by default

Under the native engine, `hotRuntime` now defaults to `'auto'`. Where the run can be bounded (at least two workers, no explicit `pool` or `test.isolate`, and a matching Vitest install), workers stay alive across test files. React Native loads once per worker, while every file still gets fresh app and test modules, mocks and timers. Elsewhere, the run keeps per-file isolation, as before.

**To keep 0.15's behaviour**, a fresh worker for every test file, set it off:

```ts
reactNative({ hotRuntime: false })
```

**What to check after upgrading:**

- A test that passes on its own but fails after other files depends on state the hot runtime carries between files. The [known differences](/guide/hot-runtime#known-differences) list the cases vitest-native knows about. Set `hotRuntime: false` for that project, and please [report it](https://github.com/danfry1/vitest-native/issues).
- [`vitest-native compare --hot`](/guide/cli#compare-hot) runs your suite both ways and lists every test whose result differs.
- The engine banner at the start of a run says `hot runtime` when it is on, and `hot runtime declined: <reason>` when the run kept per-file isolation, for example because of an explicit `pool` or a single worker.
- The mock engine is unchanged: the hot runtime applies only to the native engine.

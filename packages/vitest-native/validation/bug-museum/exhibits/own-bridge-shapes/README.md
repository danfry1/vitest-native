# Node-owned code requires project source before the test imports it: the shapes

- **Class:** ownership
- **Source:** ownership track A3 (the require bridge) and its review's adversarial shapes
- **Fixed by:** open (ownership track A3, under `experimental.ownershipModel: 'resolution'`)
- **Needs:** nothing beyond this repository's install

## The bug

A React Native workspace library (Node loads it) requires source from a second workspace
library before, or while, the test imports the same file through Vite. Node compiles its
own copy, so the module exists twice: two stores, two classes, two `module.exports`.

## Expected behaviour

One module whichever side loads it first, or a failure by name where that cannot be done
synchronously. One test file per shape:

| File | Shape | Expected |
|---|---|---|
| `require-first` | Node first, then the import | one store and class; each module evaluated once |
| `reset` | the test requires, `vi.resetModules()`, then import and require | one store after the reset |
| `legacy` | CommonJS project source, Node first | one `module.exports` |
| `cjs-import-first` | CommonJS project source, imported first | Node gets that `module.exports` |
| `reexport` | `export * from` an installed package, Node first | the names, and one module |
| `dynamic-import` | `import(name)` inside a module required first | resolved from that module |
| `in-flight` | a require while Vite is part-way through an unrelated evaluation | `REQUIRE_OF_EVALUATING_VITE_MODULE`; the import completes |
| `top-level-await` | a required module whose dependency has top-level await | `REQUIRE_OF_ASYNC_VITE_MODULE`; a later import works |
| `for-await` | top-level `for await` | `REQUIRE_OF_ASYNC_VITE_MODULE` before the module runs; a later import runs it once |
| `literal` | a string that looks like the transform's own import | left as written |
| `mock-pending` | a `vi.doMock` not yet resolved at the require | the bridge steps aside; the import still gets the mock |
| `mock-direct` | the required file is mocked by the test | the bridge steps aside; the mock stays the mock |

## Control

None: each shape is its own precondition. `own-require-first` holds the basic case.

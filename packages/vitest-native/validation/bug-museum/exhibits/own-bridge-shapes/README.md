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
| `mock-pending` | a `vi.doMock` not yet applied at the require | `MOCK_NOT_SEEN_BY_NODE` naming the importer; the import still gets the mock |
| `mock-direct` | the required file is mocked by the test | the require gets the test's mock; the mock stays the mock |
| `cycle` | an ES import cycle among required modules | evaluated once each; the import back gets the exports so far, as in Vite's runner |
| `node-cycle` | Vite evaluates a module whose Node-loaded import requires it back | the require gets its exports so far, as in Node and Jest |
| `node-loop` | that require reaches a module the bridge evaluates, which imports the first back | its exports so far, through the bridge; one module afterwards |
| `node-deep` | the bridged module's own Node-loaded import requires the first back | its exports so far, two hops deep |
| `node-first-loader` | the require back goes through a helper something else loaded first | its exports so far: decided by who calls now |
| `in-flight-importer` | a require from the test body while Vite evaluates a module that imports the requiring library | `REQUIRE_OF_EVALUATING_VITE_MODULE`: not from inside the evaluation |
| `failed` | a required module throws; or Vite's import of it threw earlier | `BRIDGED_EVALUATION_FAILED` with the module's error as `cause`; never served half-built |
| `dep-mock` | a required module imports a file the test mocks | the module gets the test's own mock (the mock dispatcher serves it) |
| `builtin-mock` | a required module imports a Node builtin the test mocks | the module gets the test's mock |

## Control

None: each shape is its own precondition. `own-require-first` holds the basic case.

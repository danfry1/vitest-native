# Under hot on Node 22, a compiled ES index's require() of a CommonJS sibling fails to link

- **Class:** per-file-state
- **Source:** #847, found by a test of an esbuild-built component library (2026-11-14)
- **Fixed by:** a require() from compiled code the loader serves as source is served as Node's CommonJS loader serves a require, behind no generation facade
- **Needs:** Node 22 (Node 24 and later link it)

## The bug

A React Native library publishes an ES index as `.mjs` beside CommonJS files, as esbuild and tsup builds do. vitest-native compiles the `.mjs` to CommonJS and hands it to Node as source. Node gives that code a `require` that resolves through vitest-native's module loader, with import conditions. So under the hot runtime each `require("./parts.js")` got the per-file generation facade meant for imports: an ES module that wraps the CommonJS file.

On Node 22 that facade fails to link, and the import of the library throws before any test runs:

```
Error: request for '…/build/fn.js?vnhot=1&vnnode' is from a module not been linked
```

Both files fail. Node 24 and later link the facade, but it is kept for the whole run.

## Expected behaviour

The compiled index's `require()` of a CommonJS sibling returns what a require returns:

- the sibling's `module.exports` (a function stays a function);
- the same instance the test file's own import of the sibling reaches;
- a new one in the next file.

## Notes

Without the hot runtime (the control), no generation facade is involved, and Node 22 links the library.

# Under hot, an import and a require() of one ES package are two instances

- **Class:** per-file-state
- **Source:** #722 (and #719 under freshRuntime)
- **Fixed by:** #722's fix: one spelling per generation for an ES package, imported or required
- **Needs:** nothing beyond this repository's install

## The bug

The hot runtime gave an `import` of an ES package as published a new instance per file (`index.js?vnhot=N`), but left a `require()` of it (Node's require(esm)) to Node. Node keeps a required ES module by its path, so the require reached one instance for the worker's life, apart from the file's import of it. Module state then differed between the two in one file, and carried across files through the require. With `freshRuntime`, the required copy kept the first file's React.

## Expected behaviour

In each file the import and the require are one instance (`a.test.ts`, `b.test.ts`), and the second file's is not the first's. `import.meta` names `index.js`.

## Notes

The vendored package is a plain ES package (no React Native peer), so Node loads it as published. The control runs per file.

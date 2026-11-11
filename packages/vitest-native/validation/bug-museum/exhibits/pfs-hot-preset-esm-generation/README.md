# Under hot, an ES dependency keeps the first file's preset mock for the worker's life

- **Class:** per-file-state
- **Source:** hot runtime probe of the synthetic preset module (2026-11-11), #670 class
- **Fixed by:** the preset module an ES import links carries the hot generation, one per test file
- **Needs:** nothing beyond this repository's install

## The bug

An ES module library in node_modules imports a preset package (`react-native-safe-area-context`). Under the hot runtime, Node serves that import a synthetic preset module, and keeps it by URL for the worker's life. The URL carried no generation, so the module stayed bound to the mocks of the first file that evaluated it.

In every later file on the worker:

- the library read another file's mock, so `mockReturnValue` did not reach it;
- this file's call assertions missed the library's calls, so `not.toHaveBeenCalled` could pass falsely;
- the library's mock was not the one the file's own import and a CommonJS `require` see.

Files b and c fail; a, the first, passes.

## Expected behaviour

Each file's ES imports of a preset package read that file's mock:

- the same mock its own import and a `require` give;
- one preset module per file, however many ES modules import the package.

## Notes

CommonJS requires were not affected: they read the file's mock on every require. Per-file isolation (the control) evaluates the preset module again in every file.

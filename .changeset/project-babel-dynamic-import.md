---
"vitest-native": patch
---

**A project whose Babel config lists `@babel/plugin-transform-dynamic-import`, or turns babel-preset-expo's native module transform back on, loads its files again.** Since `projectBabel`, every file that config applies to failed with `@babel/plugin-transform-dynamic-import depends on a modules transform plugin`, because the module transform is left out so the output stays an ES module. The dynamic-import transform is now left out with it, as `import()` runs as written, and babel-preset-expo's per-platform `disableImportExportTransform` is turned on too. No action needed.

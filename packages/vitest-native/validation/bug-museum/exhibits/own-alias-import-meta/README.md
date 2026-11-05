# Aliased workspace source using import.meta is a SyntaxError

- **Class:** ownership
- **Source:** migration testing (2026-10)
- **Fixed by:** #453 (draft) (`origin/feat/import-meta-node-compile`)
- **Needs:** nothing beyond this repository's install

## The bug

The externalized library's aliased source is compiled by Node to CommonJS, where `import.meta` is a SyntaxError: `Cannot use 'import.meta' outside a module`.

## Expected behaviour

The aliased source works whichever side loads it. Node's compile gives `import.meta.url`, `import.meta.filename` and `import.meta.dirname` their CommonJS values (as babel-plugin-transform-import-meta does under Jest), so `import.meta.url` is a string. Any other property fails by name (`IMPORT_META_IN_NODE_OWNED`).

# Aliased workspace source using import.meta is a SyntaxError

- **Class:** ownership
- **Source:** migration testing (2026-10)
- **Fixed by:** #344 (draft) (`origin/fix/source-aliased-workspace-ownership`)
- **Needs:** nothing beyond this repository's install

## The bug

The externalized library's aliased source is compiled by Node to CommonJS, where `import.meta` is a SyntaxError: `Cannot use 'import.meta' outside a module`.

## Expected behaviour

Vite owns the aliased source, so `import.meta.url` is a string.

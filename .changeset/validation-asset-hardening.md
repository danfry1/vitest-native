---
"vitest-native": patch
---

Three hardening fixes:

- **Prerelease peer versions no longer fail validation.** `4.0.0-beta.3` parsed to `[4, NaN, …]` and failed the minimum check, hard-erroring at startup for installs running betas/RCs. Prerelease/build metadata is now stripped before comparison; a prerelease of the minimum itself is accepted.
- **Mock-engine asset stubs match the native loader's semantics.** The extension match is now case-insensitive (`LOGO.PNG` stubs like `logo.png`), user-supplied `assetExts` entries are regex-escaped, and the stubbed basename is JSON-stringified so filenames containing quotes emit valid JS.
- **The mock engine's Flow-strip transform skips unparseable files instead of throwing.** The `@flow` filter is a heuristic — the marker can appear inside a string or comment of a file `flow-remove-types` then fails to parse; that parse error previously took down the whole transform pipeline.

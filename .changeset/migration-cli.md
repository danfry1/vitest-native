---
"vitest-native": minor
---

New CLI: `npx vitest-native init | doctor | migrate`.

- **`init`** writes a ready-to-run Vitest config (`--jest-compat` for the exact jest-compat block the migration guide documents; refuses to overwrite without `--force`).
- **`doctor`** diagnoses the environment read-only: Node floor (including the RNTL 14 ⇄ Node 22.13 interaction, which previously surfaced only as a raw runtime failure), required peers against supported ranges, which engine `auto` resolves to and why, every auto-detected preset, Expo presence with known-limits pointer, and config presence. Exits non-zero on blocking problems.
- **`migrate`** analyzes the project's Jest configuration (`package.json#jest` or `jest.config.{js,cjs,json}`) and reports key-by-key what maps automatically (setup files, path aliases, `transformIgnorePatterns` allowlists → `transform: [...]`, timeouts, mock hygiene flags), what the auto-detected presets already cover (deletable manual `__mocks__` and setup lines), what needs a human, and what drops — ending with a complete suggested config. Dry-run by default; `--write` saves it. Test files are never edited (`jestMockTransform()` handles top-level `jest.mock` at runtime).

The packed-tarball consumer suite exercises the bin end-to-end (`npx vitest-native doctor|migrate`).

# Errors with per-instance methods are unequal under jest-compat

- **Class:** env-contract
- **Source:** migration testing (2026-10)
- **Fixed by:** #346 (`origin/fix/jest-compat-error-equality`)
- **Needs:** nothing beyond this repository's install

## The bug

Jest compares Errors by message; Vitest by name, message, cause, prototype and own enumerable properties. zod 3's ZodError assigns per-instance arrow functions (addIssue), so two identical errors were never equal: "Compared values have no visual difference".

## Expected behaviour

Under jest-compat, errors differing only in per-instance methods are equal (toEqual and toThrow).

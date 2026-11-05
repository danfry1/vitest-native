# Coverage of project source Node requires before the test imports it

- **Class:** ownership
- **Source:** ownership track A3, decision condition 5 (coverage of a bridged module)
- **Fixed by:** open (ownership track A3, under `experimental.ownershipModel: 'resolution'`)
- **Needs:** nothing beyond this repository's install

## The bug

A React Native workspace library (Node loads it) requires `covered.ts` before the test
imports it. Node runs its own compile of the file, which v8 coverage does not attribute to
the source, so the statements that ran are missing from the report.

## Expected behaviour

The module is evaluated once, by Vitest, and the report counts the statements that ran
(`return prefix + "taken"`, `picked`) and not the branch that did not (`return prefix +
"not taken"`). `covered.ts` imports `prefix.ts`, so the module the bridge evaluates has an import to
rewrite. The check sees attribution (the statements counted under `covered.ts`), not
column offsets: a few characters' shift leaves these line counts unchanged.
`check.mjs` reads `coverage/coverage-final.json`.

## Control

None: `own-require-first` holds the identity case; this one adds coverage.

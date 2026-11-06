# Coverage of project source Node requires before the test imports it

- **Class:** ownership
- **Source:** ownership track A3, decision condition 5 (coverage of a bridged module)
- **Fixed by:** open (ownership track A3, under `experimental.ownershipModel: 'resolution'`)
- **Needs:** nothing beyond this repository's install

## The bug

A React Native workspace library (Node loads it) requires `covered.ts` before the test
imports it. Node runs its own compile of the file, and the test's import has Vite
evaluate it again: the module is two (`coverage.test.ts` fails on identity). Coverage
itself is still reported then, from Vite's copy, so the flag-off failure is the identity
one. What this exhibit adds over `own-require-first` is the flag-on half: the one
evaluation, the bridge's, is counted under `covered.ts` (`check.mjs`).

## Expected behaviour

The module is evaluated once, by Vitest, and the report counts the statements that ran
(`return prefix + "taken"`, `picked`) and not the branch that did not (`return prefix +
"not taken"`). `covered.ts` imports `prefix.ts`, so the module the bridge evaluates has an import to
rewrite. The check sees attribution (the statements counted under `covered.ts`), not
column offsets: a few characters' shift leaves these line counts unchanged.
`check.mjs` reads `coverage/coverage-final.json`.

## Control

None: `own-require-first` holds the identity case; this one adds coverage.

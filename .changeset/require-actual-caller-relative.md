---
"vitest-native": patch
---

`jest.requireActual` resolves relative paths against the calling file

Jest resolves `jest.requireActual('../thing')` against the module that called it. The
compat layer backed it with a single `createRequire` anchored at the project root, so
bare specifiers worked and relative ones escaped the source tree: MODULE_NOT_FOUND,
with a requireStack pointing at `<projectRoot>/package.json` — a confusing place to
be sent when the file sits beside the test. A migration reported this breaking five
files until they shimmed around it.

Relative specifiers now resolve from the caller, taken from the stack, since these
are runtime calls on the `jest` global rather than rewritten imports. Bare specifiers
still resolve from the project, and a caller-relative miss is reported rather than
retried against the root, which could otherwise resolve an unrelated file that
happens to sit at the same relative path.

# An installed library's require ignores a react-native field that is a different implementation

- **Class:** transform/resolution
- **Source:** ADR-0005 decision 7 (the `react-native` field classification): a field can name a native build where `main` names a web build
- **Fixed by:** #370 (draft; `experimental.ownershipModel: 'resolver'`, ownership track A1)
- **Needs:** nothing beyond this repository's install

## The bug

`museum-rn-field` points its `react-native` field at a different implementation than
`main`: a native build beside a web build. Metro takes the `react-native` field for
every request, so a device runs the native build everywhere. Under the native engine the
test's own import takes the field, but an installed library's `require` of the same
package takes `main`. The library runs the web implementation, and the package is two
modules. Silent: no error, wrong code.

ADR-0005 considers making `main` the default (Jest's answer, and faster) if every such
field is format-only. A package like this one is why that switch needs per-package
deviations, and this exhibit guards both sides of it.

## Expected behaviour

The native implementation for the test's import and for an installed library's
`require` alike. #370 gives that under `experimental.ownershipModel: 'resolver'`; run it
with `run.mjs --ownership resolver`.

## Control

`main` names the native build too, so the field is format-only and every answer is the
native implementation.

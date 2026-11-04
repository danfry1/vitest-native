# A package with separate import and require builds loads twice

- **Class:** ownership
- **Source:** ADR-0004 (`dual-export-file`); #370's identity probes (`tests-native/ownership/identity.test.ts`)
- **Fixed by:** #370 (draft; `experimental.ownershipModel: 'resolver'`, ownership track A1)
- **Needs:** nothing beyond this repository's install

## The bug

`museum-dual`'s `exports` map has an `import` build and a `require` build, each with its
own module state. The test imports it, so the `import` condition picks `esm.mjs`; the
package's own CommonJS file requires it, so Node's `require` condition picks `cjs.cjs`.
The package exists twice, and a value the test sets is not what the library reads.
Silent: no error, wrong values.

Jest resolves every request, import or require, with one condition set, and Metro bundles
one copy, so neither splits the package.

## Expected behaviour

One `museum-dual` whichever condition loaded it: the reader sees what the test set.
#370 has both sides load the `require` build under `experimental.ownershipModel:
'resolver'`; run it with `run.mjs --ownership resolver`.

## Control

Both conditions name the same build (`cjs.cjs`), so there is one file to load.

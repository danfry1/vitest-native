---
"vitest-native": patch
---

Compile a preset-shadowed package's pass-through entries when Node cannot run them

Preset packages are shadowed: their bare and subpath imports are redirected to the
preset mock before any file loads. The deliberate exceptions — package.json
subpaths, assets, and Node-safe utility entries such as `mock`, `plugin`, and
`jest-utils` — pass through to the real file. Some of those files only Metro can
run: react-native-worklets publishes its own mock entry (`lib/module/mock.js`) as
ESM `import` statements over a `module.exports = …` footer. And because the preset
shadow is exactly what keeps such packages out of ecosystem detection, nothing else
would ever compile them. A suite that maps the package onto its published mock —
react-native-paper does, via
`vi.mock('react-native-worklets', () => require('react-native-worklets/lib/module/mock'))` —
lost every test file whose component imports the package.

Preset-shadowed package names now join the Node-side transform set, built in the
worker from the same preset definitions that power the redirect, so user-supplied
presets are covered alongside the auto-detected ones. Membership only makes a file
eligible: `needsTransform` still gates every compile, so a pass-through Node can
already run is served untouched. The hot runtime needed one more piece — its worker
installs the require hooks at boot, before the setup file has built the preset
mocks, and the install-once guard silently pinned that boot-time list; the guard
now updates the transform matcher instead.

What the served-as-published failure looks like depends on the Node version, and
both shapes are cured: where Node lacks a `module` global the require(esm) retry
throws "module is not defined in ES module scope", and on Node 24 — which defines
`module` as a global — the file loads silently with EMPTY exports instead.

The thrown shape also joins the explained-error family: the ReferenceError from a
mixed ES-module/CommonJS file now gets the same actionable message as untranspiled
JSX/Flow/TS SyntaxErrors — naming the owning package and the `transform: [...]`
remedy — instead of a bare "module is not defined in ES module scope".

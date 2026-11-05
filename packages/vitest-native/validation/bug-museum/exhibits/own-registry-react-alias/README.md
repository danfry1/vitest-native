# A React dedupe alias with the precompiled registry gives two Reacts

- **Class:** ownership
- **Source:** compressed plan review F5: the registry's pre-resolved externals and the shared resolver
- **Fixed by:** open (ownership track A1: #370 resolves the registry's externals through the shared resolver under `experimental.ownershipModel: 'resolver'`)
- **Needs:** nothing beyond this repository's install

## The bug

A monorepo app has its own copy of React beside the root's, and dedupes it with
`resolve.alias: { react: <the app's copy> }`, as a Jest `moduleNameMapper` does. The
test's components and hooks take the alias. Node loads React Native and the renderer,
and resolves their `react` without it: React Native's graph comes from the precompiled
registry (the default), whose externals were resolved in the main process with Node's
resolution and no aliases, and the renderer is an installed package Node resolves from
its own directory. Both get the root's copy. Two Reacts: a component's `useState` reads a
dispatcher the renderer never set, and React reports an invalid hook call.

Jest applies `moduleNameMapper` to every request, React Native's included, so the alias
makes one React.

## Expected behaviour

One React, the one the alias names: a component with hooks renders. Under
`experimental.ownershipModel: 'resolver'` the registry's externals have to go through the
same resolver as everything else, with the resolver's inputs in the registry key; run
it with `run.mjs --ownership resolver`.

## Control

The alias names the root's React, the copy React Native resolves, so there is one React.

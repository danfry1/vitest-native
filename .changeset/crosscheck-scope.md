---
"vitest-native": patch
---

The fidelity page now states what the cross-check covers, and the corpus reaches further

A matching probe count says how many comparisons pass, not how much of the mock they
reach. It reached 9 of 27 mocked APIs, and the page listed 81 green ticks without
mentioning that — a reader would reasonably infer broader coverage than existed. The
page now reports the covered fraction and names every API and component no probe
touches. It is computed when the page is generated, so it moves with the corpus instead
of going stale.

Four probes were added over the untouched surface, chosen where a difference would be a
real mock bug rather than an unavoidable device difference: the full `Easing` curve set
including `bezier` and the parameterised `elastic`/`back`/`bounce`, `InteractionManager`,
and a `DeviceEventEmitter` round trip.

That found one: `InteractionManager.runAfterInteractions()` runs its task synchronously
under the mock engine, while real React Native defers it a tick. Both run it exactly
once, so this is timing rather than behaviour — but a test asserting immediately after
the call passes under the mock and fails under the native engine. It is now recorded as
a known difference; awaiting a tick, or using a `findBy*` query, works under both.

<!--
  GENERATED FILE — do not edit by hand.
  The committed version is a placeholder. The RN matrix workflow renders this
  page from its cross-check reports (scripts/fidelity-matrix.mjs) and publishes it
  to the site-data branch, which the site's build fetches.
-->
# Fidelity matrix

The [behavioral cross-check](/guide/fidelity) runs the same probe corpus under
the mock engine **and** under real React Native — and CI runs it against
**every supported React Native version** in the
[Vitest × RN matrix](https://github.com/danfry1/vitest-native/actions/workflows/native-rn-matrix.yml).
This page is generated from that matrix's own reports, so every number below
was produced by CI, not written by hand.

**Every probe matches on every gated React Native version.**

| React Native | Vitest | Flavor | Probes matching | Generated |
| --- | --- | --- | --- | --- |
| 0.86.0 | 5.1.0 | latest-supported | ✅ 89/89 | 2026-11-14 |
| 0.86.0 | 5.1.0 | locked | ✅ 89/89 | 2026-11-14 |
| 0.87.1 | 5.1.0 | latest-supported | ✅ 88/88 | 2026-11-14 |
| 0.87.1 | 5.1.0 | locked | ✅ 88/88 | 2026-11-14 |
| 0.88.0 | 5.1.0 | latest-supported | ✅ 88/88 | 2026-11-14 |
| 0.88.0 | 5.1.0 | locked | ✅ 88/88 | 2026-11-14 |

## Divergences

_None. Every probe matched in every cell of the latest matrix run._

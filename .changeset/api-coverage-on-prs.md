---
"vitest-native": patch
---

Check React Native API coverage on every pull request

The mock engine is documented as covering every stable React Native export, and
`check-compat` is the script that backs the claim: it parses the real `react-native`
index and fails when a stable export has no mock.

It ran only in the weekly compatibility workflow, and there against
`react-native@latest`. The version actually pinned in the repository was never checked
on a pull request. A change that moved the pinned React Native could add stable exports
the mock did not cover and still go green, with the gap appearing days later as a
canary failure against a different version.

It now runs in the pull-request gate against the pinned React Native, on the one matrix
leg where the React Native version is representative. The weekly canary keeps its own
edge run — the two answer different questions.

Currently 85 of 85 stable exports are covered.

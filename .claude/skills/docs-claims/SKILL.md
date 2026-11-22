---
name: docs-claims
description: Write or change user-facing docs (website/, the READMEs, packaged docs) so every claim is true and stays true. Use for any docs edit, landing-page copy, or number shown to users.
---

# Docs claims

1. **Every claim is provable from the source or a gate.** Read the code that does the thing
   before describing it. When a page and the source disagree, the source wins.
2. **Generate numbers instead of typing them.** Read supported versions from the plugin's
   startup checks (`src/peer-requirements.ts`, `src/node-range.ts`) at build time, show
   run output captured from a real run that CI repeats, and build the fidelity page from
   `crosscheck/known-differences.json` (`bun run fidelity:report`). Edit the source, then
   regenerate; never hand-edit a generated page.
3. **No speed claims without an evidence log** (see `perf-measurement`). A real app's pass
   count is an observation, not a measure of capability, and is not shown as one.
4. **Run the code you show.** A block a reader copies carries a `<!-- doc-snippet: … -->`
   marker and runs in the packed app (`scripts/doc-snippets.mjs`).
5. **Use the reader's vocabulary.** Say "loaded by Node", not "Node-owned"; "React
   Native's precompiled modules", not "registry"; and no "closure", "ownership", "realm" or
   "manifest" in prose. The table in CONTRIBUTING.md has the replacements.
6. **Link the site's headings, and let the tests check them.** `tests/site-anchors.test.ts`
   resolves every site link, including those in `src/` messages; `tests/documented-cli.test.ts`
   checks each CLI flag is documented.
7. **Keep pages short and runnable.** Lead with the command or the code; explain after.
8. **Check visual changes at real widths** (1280, 1440, 1920 and 390), in light and dark,
   before review. `tests/site-contrast.test.ts` holds the theme to WCAG AA.
9. **Run `bun run test:docs`** from `packages/vitest-native` before pushing.

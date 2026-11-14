# Lane: docs

The website, the READMEs, `CONTRIBUTING.md` and the package's `docs/`. Feature PRs update their own docs page. This lane takes **docs-only** work.

**Where to look:** `website/guide/` (`plugin-options.md`, `errors.md`, `troubleshooting.md`), `website/releases/`, `docs/versioning.md`, `docs/ownership-model.md`, `docs/hot-default-design.md`.

## Settled decisions
- **Never lead with speed.** The public promise is "no count regression against the released anchor; timing is a tripwire". Cite only results anyone can reproduce. (ADR 0002, 0017)
- **Name every active correction and every declared divergence.** (ADR 0008, 0012)
- **The READMEs stay byte-identical outside their marked sections.**

## Conventions
- **Pin every claim to its source line with a test.**
- **A PR that adds an error code adds its `website/guide/errors.md` entry, with an anchor.** Internal codes too.
- **A new option needs a `plugin-options.md` section** whose Type and Engine match the JSDoc. Run `bun run --filter vitest-native test:docs`.
- **Use the user's vocabulary.** No private paths, no internal terms.
- **Run oxfmt only on paths that `format:check` covers,** and format only the lines you changed. On `website/`, it rewrote guide examples.

## Open
- `CONTRIBUTING.md` still tells contributors to run `bunx changeset`, and says `build` runs `bunx --bun tsdown`. Both contradict the no-`bunx` rule that CI enforces. Update it.

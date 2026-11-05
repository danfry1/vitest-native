# Under hot on Vitest 4.1, an automock replays another file's factory

- **Class:** per-file-state
- **Source:** migration testing (2026-10)
- **Fixed by:** #338 (merged)
- **Needs:** vitest 4

## The bug

A module fetched while a file factory-mocks it becomes a placeholder node (empty code + `meta.mockedModule`). The hot runtime keeps module nodes across files and its reset did not clear `meta`; Vitest 4.1.11's cachedRequest replays `meta.mockedModule` whenever the current file has ANY mock for the id, so file b's automock got file a's factory. Vitest 5 is unaffected. Intermittent in real runs (needs a before b in one worker), hence the by-name sequencer.

## Expected behaviour

Each file gets its own factory and its own automock.

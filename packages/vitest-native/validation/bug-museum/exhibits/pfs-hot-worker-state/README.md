# Under hot, a later file reads the first file's Vitest worker state and loses RNTL's auto-cleanup

- **Class:** per-file-state
- **Source:** #690
- **Fixed by:** #690's fix: the hot reset leaves Vitest's globals alone, and verifies that Vitest's worker state names the file starting
- **Needs:** nothing beyond this repository's install

## The bug

The hot reset puts back globals a file changed, except the harness's. Its pattern matched Vitest's names case-sensitively and missed `__vitest_worker__`, which Vitest defines anew for every file. Every later file on a worker therefore got the first file's worker state back, with the first file's path and module graph. The engine's RNTL auto-cleanup reads that graph to see whether the file opted out with `dont-cleanup-after-each` (#534). When the first file on a worker had opted out, every later file on it lost auto-cleanup, and components from one test stayed mounted into the next.

## Expected behaviour

`c-victim`'s first component is unmounted before its second test, as it is per file.

## Notes

The control runs per file. `b-filler` keeps the second worker busy, so `c-victim` runs on `a-polluter`'s worker.

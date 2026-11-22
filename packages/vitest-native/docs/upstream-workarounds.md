# Upstream workarounds

Code in vitest-native that exists only because of a bug in an upstream release (Vitest, Vite, Node, React Native, Expo, React, RNTL). This is step 3 of the upstream-bug ladder in [upstream-policy.md](./upstream-policy.md#3-upstream-bugs-the-ladder). A workaround is the last resort, after reporting or fixing the bug upstream and after moving a floor.

**A workaround here must:**
- **Detect the broken behaviour,** never a version string.
- **Use public API only:** no monkey-patching (lint rule `vitest-native/no-monkey-patching`).
- **Live in one place,** behind one function, so removing it is one change.
- **Have two tests:**
  - **Need test:** fails without the workaround, on an affected release.
  - **Expiry test:** fails once the supported range's floor includes the upstream fix. That failure is the signal to delete the workaround and its row. Write it with `stillNeeded()` from `tests/support/upstream-expiry.ts`.

`tests/upstream-workarounds.test.ts` checks every row below: the upstream issue is a link, the affected versions are stated, and the source file, need test and expiry test all exist.

## Entry template

```md
| [owner/repo#123](https://github.com/owner/repo/issues/123) | vitest | >=5.0.0 <5.2.0 | 5.2.0 | `src/path/file.ts` (`functionName`) | `tests/need-x.test.ts` | `tests/expiry-x.test.ts` | One line: what users would see without it. |
```

## Workarounds

| Upstream issue | Package | Affected | Fixed in | Where | Need test | Expiry test | Effect |
|---|---|---|---|---|---|---|---|

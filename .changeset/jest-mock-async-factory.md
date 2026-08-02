---
"vitest-native": patch
---

`jest.mock` with an async factory keeps its named exports

`jestMockTransform()` wraps each `jest.mock` factory so its return passes through
Jest's CommonJS interop. The wrapper handled a synchronous return only. An async
factory — or any factory returning a promise — handed the promise itself to the
interop, where it matched the object branch: a promise has no own enumerable keys and
no `default`, so the result was `{ default: Promise }`. Every named export
disappeared, and the failure surfaced as

    No "readSetting" export is defined on the "./settings-store" mock.
    Did you forget to return it from "vi.mock"?

naming a `vi.mock` the author never wrote.

Interop now applies to the resolved module. The check is by object tag rather than for
a `then` method: a module may legitimately export a function named `then`, and
awaiting that calls it with `(resolve, reject)` and never settles, hanging the test
file instead of failing it. `async` functions and `Promise.resolve` only ever produce
native promises, which the tag identifies across realms.

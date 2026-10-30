---
"vitest-native": patch
---

**With RNTL 12 or 13 (React 19's `react-test-renderer`), a recoverable React error is logged instead of failing the run.** Both engines. No action needed.

Before, when a component threw once during a concurrent render and React rendered it again successfully, Node reported the error as an uncaught exception, so Vitest exited 1 with an unhandled error while every test passed. React's recoverable errors are now logged with `console.error`, as React 18.3's test renderer and RNTL 14's renderer log them (a device logs them as a warning). Any other error the renderer reports, such as an uncaught render error outside `act()`, still fails the run.

`globalThis.reportError` is defined only while the renderer loads and removed after, so other code that feature-detects it behaves as before. The handler is recognised by React's function name; a React release that renames it would bring the failure back, and a test pinned to the installed renderer catches that.

On Node 26, an uncaught render error is now reported as that error. React's own fallback checks only for a global `ErrorEvent`, which Node 26 adds, and then calls `window.dispatchEvent`, which React Native's `window` (the global object) does not have, so the error surfaced as `TypeError: window.dispatchEvent is not a function`.

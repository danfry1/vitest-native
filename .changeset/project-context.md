---
"vitest-native": patch
---

Workers now read their configuration from one validated project context file instead of about twenty environment variables, and fail by name (`CONTEXT_INVALID`) when it is missing, stale or malformed, where a bad value used to become a default silently. Each part of the run that resolves packages (Node's `require` hooks, the ESM loader, the Vite side) also checks it resolves from the same inputs, and fails with `RESOLVER_INPUT_MISMATCH` when, for example, a `--conditions` flag reaches only some workers. Test results are unchanged.

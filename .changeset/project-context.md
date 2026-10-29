---
"vitest-native": patch
---

Workers now read their configuration from one validated project context file instead of about twenty `VITEST_NATIVE_*` environment variables, and fail by name (`CONTEXT_INVALID`) when it is missing, stale or malformed, where a bad value used to become a default silently. The file is rewritten if the cache is cleared during a watch session, and falls back to the system temp directory when the cache cannot be written. Those variables were never documented; one still set in the shell or `test.env` is now ignored, with a warning naming it. Test results are unchanged.

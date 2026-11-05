---
"vitest-native": patch
---

**`vitest-native migrate --write` no longer ends with "Re-run with --write".** Once the config is saved, the closing line names the next step instead: `✓ wrote vitest.config.mts from the analysis above. Next: npx vitest-native doctor && npx vitest`. Without `--write`, the report still ends with how to save the config. No action needed.

---
"vitest-native": minor
---

React Native 0.87 joins the supported matrix

The verified range is now 0.81–0.87: the CI matrix gains a 0.87 row (and the
Vitest 5 column moves its newest-RN cell up), the workspace pins 0.87, and the
published range statements follow. 0.87 removed InteractionManager, so its
cross-check probe is version-gated rather than deleted — the 0.81–0.86 legs
still compare it, and the published corpus count on the pinned version drops
from 85 to 84 with the retirement recorded deliberately via the report's
--allow-corpus-shrink flag.

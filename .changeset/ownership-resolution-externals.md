---
"vitest-native": patch
---

**Native engine with `experimental: { ownershipModel: 'resolution' }`: project source that Node requires first costs one fetch per module, plus one per installed package it imports.** No action needed.

- Before, every import of an installed package from such a module asked the main process again.

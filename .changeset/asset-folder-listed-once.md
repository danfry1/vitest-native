---
"vitest-native": patch
---

**Requiring many images from one folder reads that folder once, not once per image.** Each asset's scale variants (`icon@2x.png`, `icon@3x.png`, `icon.ios.png`) come from a listing of its folder. That listing was read and parsed again for every asset. A design system with hundreds of icons in one folder paid for it hundreds of times in every worker. The folder is now listed once and read again only after it changes. Asset ids and descriptors are unchanged. No action needed.

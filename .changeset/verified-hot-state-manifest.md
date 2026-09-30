---
"vitest-native": patch
---

Verify and restore hot-runtime shared-realm state between test files

Hot mode now uses an ordered state manifest for Vitest timers and stubs, native
boundary overrides, known React Native state, environment changes, process and RN
listeners, global and console property descriptors, ErrorUtils, and the Expo
compatibility runtime. Every restore is followed by final-realm verification, and a
failure names the responsible entry instead of surfacing later as an order-dependent
test failure.

An adversarial two-file suite contaminates every supported surface. A mutation gate
disables all eleven restore actions one at a time and requires each omission to fail,
covering both the normal precompiled registry and the resident-RN fallback path.

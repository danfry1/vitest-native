---
"vitest-native": patch
---

Stop printing React Native's deprecation notices on every import under the native engine. The `react-native` facade read every export while it initialised, and React Native prints the notice for a deprecated or extracted member (`SafeAreaView`, `Clipboard`, `PushNotificationIOS`, …) from that member's getter, so importing only `Pressable` printed all of them. Deprecated members are now exposed as getters and read only when used, so a notice appears only in tests that use the member. The export-name parser also no longer picks up keys from code after the exports object.

---
"vitest-native": patch
---

**`instanceof View` works under jest-compat, and a method added to `View.prototype` reaches View refs, as under React Native's Jest preset.** With the native engine, `ref instanceof View` threw "Right-hand side of 'instanceof' is not callable", because React Native's View is not a class; it now answers whether the value is a View ref (Animated.View and Pressable refs included, Text and ScrollView refs not). View refs now inherit from `View.prototype`, so a suite that defines a method there (react-native-paper's Menu tests add `querySelector`) can call it on a ref; before, only the six native methods reached refs.

---
"vitest-native": patch
---

**Under jest-compat, `ref instanceof View` works and a method added to `View.prototype` reaches View refs, as under React Native's Jest preset.** No action needed.

- `instanceof View` used to throw "Right-hand side of 'instanceof' is not callable", because React Native's View is not a class. It is now true for View, Animated.View and Pressable refs, and false for Text and ScrollView refs.
- View refs inherit from `View.prototype`, so a method a suite defines there (react-native-paper's Menu tests add `querySelector`) can be called on a ref.

---
"vitest-native": patch
---

Fix the matcher type augmentations for Vitest 4 and Vitest 5. Under Vitest 4, `expect(x).toHaveAnimatedStyle(...)` and `toHaveAnimatedProps(...)` from `vitest-native/matchers` were untyped: the published declaration file augmented the `vitest` module without referencing it, which Vitest 4's type layout needs for the augmentation to merge. The declarations now reference `vitest`, and both `vitest-native/matchers` and `vitest-native/rntl-matchers` use Vitest 5's `Assertion<R, T>` type parameters. The matchers are typed on both majors; a Vitest 4 project that checks declaration files (`skipLibCheck: false`) reports TS2428 for the differing type parameters.

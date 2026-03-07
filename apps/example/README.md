# Example App

Demonstrates vitest-native in a realistic React Native project.

## Running Tests

```bash
bun run --filter '@vitest-native/example' test
```

## Test Files

| File | What It Tests |
|------|--------------|
| `basic.test.ts` | Minimal smoke test — imports and renders a View |
| `apis.test.ts` | 73 tests covering Platform, Dimensions, StyleSheet, Animated, Alert, Keyboard, Linking, Modal, Appearance, Image, Share, PermissionsAndroid, hooks, and more |
| `hooks.test.ts` | useColorScheme reactivity inside a rendered component |
| `Greeting.test.tsx` | Simple component rendering with RNTL |
| `FeedList.test.tsx` | FlatList/SectionList with headers, footers, separators, empty states, RefreshControl |
| `ProfileScreen.test.tsx` | Full-featured screen testing: platform switching, dark mode, dimensions, Animated, navigation-like patterns |

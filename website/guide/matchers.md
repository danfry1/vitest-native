# Matchers and Snapshots

vitest-native registers React Native Testing Library's matchers, Vitest equivalents of Reanimated's animated matchers, and a snapshot serializer for React Native trees. None of them needs a setup file.

## RNTL matchers

When supported `@testing-library/react-native` 12–14 is installed, `vitest-native`
auto-registers its custom matchers across each major's export layout. No manual
`extend(matchers)` call or setup file is needed.

### TypeScript

The matchers run without any setup, but their **types** need one line. RNTL declares
them only for Jest — it augments the global `jest` namespace and `@jest/expect`, and
neither reaches Vitest's `Assertion` — so without this they are
`Property 'toHaveTextContent' does not exist on type 'Assertion<...>'` even though the
assertion works at runtime.

Reference the types once, anywhere in the project:

```ts
/// <reference types="vitest-native/rntl-matchers" />
```

or add it to `compilerOptions.types` in `tsconfig.json`:

```json
{ "compilerOptions": { "types": ["vitest-native/rntl-matchers"] } }
```

It is opt-in rather than automatic because `@testing-library/react-native` is an
optional peer: a type import of an absent package is invisible under
`skipLibCheck: true` (React Native's default) but reports `TS2307` under
`skipLibCheck: false`, which would break projects that use the mock engine without
RNTL. Referencing nothing loads nothing — the file is not part of the program unless
asked for.

The following matchers become available on `expect()`:

| Matcher                           | Description                                   |
| --------------------------------- | --------------------------------------------- |
| `toBeVisible()`                   | Element is visible                            |
| `toBeEmptyElement()`              | Element has no children                       |
| `toBeEnabled()`                   | Element is not disabled                       |
| `toBeDisabled()`                  | Element is disabled                           |
| `toHaveTextContent(text)`         | Element contains the given text               |
| `toHaveProp(name, value?)`        | Element has the specified prop                |
| `toHaveStyle(style)`              | Element has the specified styles              |
| `toBeOnTheScreen()`               | Element is in the component tree              |
| `toContainElement(element)`       | Element contains the given child              |
| `toHaveAccessibilityState(state)` | Element has the specified accessibility state |
| `toHaveAccessibilityValue(value)` | Element has the specified accessibility value |
| `toBeSelected()`                  | Element is selected                           |
| `toBeChecked()`                   | Element is checked                            |
| `toBePartiallyChecked()`          | Element is partially checked                  |
| `toBeBusy()`                      | Element is busy                               |
| `toBeExpanded()`                  | Element is expanded                           |
| `toBeCollapsed()`                 | Element is collapsed                          |

```tsx
import { render, screen } from "@testing-library/react-native";
import { View, Text } from "react-native";

test("greeting is visible with correct style", async () => {
  await render(
    <View>
      <Text style={{ color: "red", fontSize: 18 }}>Hello</Text>
    </View>,
  );

  const text = screen.getByText("Hello");
  expect(text).toBeVisible();
  expect(text).toHaveStyle({ color: "red" });
  expect(text).toHaveTextContent("Hello");
});
```


## Animated matchers (Reanimated)

`react-native-reanimated` ships `toHaveAnimatedStyle` and `toHaveAnimatedProps` through its Jest setup, which isn't available under Vitest. `vitest-native` registers Vitest-native equivalents automatically — no `setUpTests()` call or setup file needed.

| Matcher                               | Description                                                                                                             |
| ------------------------------------- | ----------------------------------------------------------------------------------------------------------------------- |
| `toHaveAnimatedStyle(style, config?)` | Element's (flattened) style contains the given entries. Pass `{ shouldMatchAllProps: true }` to require an exact match. |
| `toHaveAnimatedProps(props)`          | Element's animated props contain the given entries.                                                                     |

Because the `reanimated` preset resolves `useAnimatedStyle`/`useAnimatedProps` synchronously, the animated values land on the rendered element and these matchers read straight from it:

```tsx
import { render, screen } from "@testing-library/react-native";
import Animated, { useSharedValue, useAnimatedStyle } from "react-native-reanimated";

function Skeleton({ visible }: { visible: boolean }) {
  const opacity = useSharedValue(visible ? 1 : 0);
  const style = useAnimatedStyle(() => ({ opacity: opacity.value }));
  return <Animated.View testID="bone" style={style} />;
}

test("starts with full opacity", async () => {
  await render(<Skeleton visible />);
  expect(screen.getByTestId("bone")).toHaveAnimatedStyle({ opacity: 1 });
});
```

### Reanimated + Gesture Handler without manual mocks

Both libraries are auto-detected, so a component using a `Gesture` + `GestureDetector` driving an animated style needs no `vi.mock()` calls:

```tsx
import { render, screen, fireEvent } from "@testing-library/react-native";
import { Gesture, GestureDetector } from "react-native-gesture-handler";
import Animated, { useSharedValue, useAnimatedStyle } from "react-native-reanimated";

function Card() {
  const pressed = useSharedValue(false);
  const style = useAnimatedStyle(() => ({ opacity: pressed.value ? 0.5 : 1 }));
  const tap = Gesture.Tap().onStart(() => {
    pressed.value = true;
  });
  return (
    <GestureDetector gesture={tap}>
      <Animated.View testID="card" style={style} />
    </GestureDetector>
  );
}

test("card renders at full opacity", async () => {
  await render(<Card />);
  expect(screen.getByTestId("card")).toHaveAnimatedStyle({ opacity: 1 });
});
```

> RNGH's `Pressable` is also exported by the preset and mirrors React Native's `Pressable` (including not firing `onPress` when `disabled`), so you can swap `import { Pressable } from 'react-native-gesture-handler'` straight into tests.

### TypeScript

To type the matchers on `expect()`, add the matcher types to your `tsconfig.json`:

```jsonc
{
  "compilerOptions": {
    "types": ["vitest-native/matchers"],
  },
}
```


## Snapshot serializer

A snapshot serializer is auto-registered that produces clean, JSX-like output for React Native components. Instead of deeply nested `ReactTestInstance` objects, snapshots read naturally:

```
<View>
  <Text
    style={
      {
        "fontSize": 18,
      }
    }
  >
    Hello, World
  </Text>
</View>
```

No configuration is required. The serializer is active for all snapshot tests automatically, under both engines. The example shows the mock engine's element names; under the native engine a snapshot shows React Native's real host names, such as `RCTView` and `RCTText`.

Next: [Test Helpers](/guide/helpers).



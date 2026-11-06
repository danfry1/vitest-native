# Matchers and Snapshots

vitest-native registers React Native Testing Library's matchers and Vitest equivalents of Reanimated's animated matchers, and React Native trees print in snapshots as under Jest. None of them needs a setup file.

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


## Snapshots

A React Native tree prints the way Jest and Vitest print any React tree: with pretty-format's `ReactTestComponent` plugin, which Vitest registers. vitest-native adds no serializer of its own.

```
<RCTView
  style={
    [
      {
        "flex": 1,
      },
      undefined,
    ]
  }
  testID="box"
>
  <RCTText
    accessible={true}
    allowFontScaling={true}
    ellipsizeMode="tail"
    style={
      [
        {
          "overflow": "hidden",
        },
        undefined,
      ]
    }
  >
    hello
  </RCTText>
</RCTView>
```

That is `<View testID="box" style={[{ flex: 1 }, undefined]}><Text>hello</Text></View>` under the native engine (pinned by `tests-native/snapshot-format.test.tsx`).

What a snapshot shows is the tree the engine renders:

- **The native engine** renders React Native's own components down to its native boundary. A snapshot shows the host components React Native renders (`RCTView`, `RCTText`) with the props React Native passes them, such as the defaults `Text` adds.
- **The mock engine** renders its own host elements, named after the component (`View`, `Text`).
- **No host prints a `ref`.** A ref attaches to a host instance that has the native methods (`measure`, `focus`, …).

### Snapshots written under Jest

They are in the same format, and Vitest reads a Jest `.snap` file as it is. Snapshots of plain values pass unchanged.

A snapshot of React Native components still differs once:

- **Why.** React Native's Jest preset replaces `View`, `Text`, `Image`, `TextInput`, `ScrollView` and a few others with stand-ins. Those render a host named after the component, with the props as given. vitest-native renders React Native's own host components instead.
- **What to do.** Once the rest of the suite passes, re-record with `vitest -u` and review the diff. `vitest-native migrate` counts the snapshot files this applies to.
- **The header line.** When Vitest runs a test file whose snapshots all pass, it rewrites that `.snap` file's first line from Jest's header to its own, even in CI. Commit that change with the migration.

::: details Before 0.15
Snapshots used a format of vitest-native's own: props as one-line JSON, `undefined` as `"[undefined]"`. Snapshots recorded in it need `vitest -u` once. For one release the old format is still available: `expect.addSnapshotSerializer(serializer)` with `serializer` from `vitest-native/serializer`, in a setup file. It is deprecated.
:::

Next: [Test Helpers](/guide/helpers).



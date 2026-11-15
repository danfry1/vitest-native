# Writing Tests

Tests render a component with [React Native Testing Library](https://callstack.github.io/react-native-testing-library/),
find what a user would see, act on it as a user would, and check the result. Under the default
`native` engine the component runs React Native's own component code: a `Pressable`, `TextInput`
or `FlatList` is the real JavaScript, with the native side mocked.

This page builds on the [Quick Start](/guide/quick-start). The examples use Testing Library 14,
where `render`, `fireEvent` and `act` are async, and each one runs as written, on Testing Library
14, in vitest-native's own tests.

## Find what the user sees

Every query starts from `screen`. Prefer the queries that match how a user finds an element:

1. `getByRole('button', { name: 'Sign in' })`: a control, by its role and its label.
2. `getByLabelText('Email')`: an input, by its label.
3. `getByText('Hello, Ada')`: text on screen.
4. `getByTestId('avatar')`: when nothing a user perceives identifies the element.

Each query comes in three forms:

| Form | When nothing matches | Use it for |
| --- | --- | --- |
| `getBy…` | throws | an element that is there now |
| `queryBy…` | returns `null` | checking that an element is _not_ there |
| `findBy…` | waits, then rejects | an element that appears after async work |

The `getAllBy…`, `queryAllBy…` and `findAllBy…` forms return every match.

## Act as a user

`userEvent` presses and types as a user does: a press goes through press-in and press-out, and
typing sends each character. Create it with `userEvent.setup()` and await each call:

<!-- doc-snippet: src/SignInForm.tsx -->
```tsx
// SignInForm.tsx
import { useState } from 'react'
import { Pressable, Text, TextInput, View } from 'react-native'

export function SignInForm({ onSubmit }: { onSubmit: (email: string) => void }) {
  const [email, setEmail] = useState('')
  return (
    <View>
      <TextInput accessibilityLabel="Email" value={email} onChangeText={setEmail} />
      <Pressable
        accessibilityRole="button"
        disabled={email === ''}
        onPress={() => onSubmit(email)}
      >
        <Text>Sign in</Text>
      </Pressable>
    </View>
  )
}
```

<!-- doc-snippet: src/SignInForm.test.tsx -->
```tsx
// SignInForm.test.tsx
import { expect, it, vi } from 'vitest'
import { render, screen, userEvent } from '@testing-library/react-native'
import { SignInForm } from './SignInForm'

it('submits the email', async () => {
  const onSubmit = vi.fn()
  const user = userEvent.setup()
  await render(<SignInForm onSubmit={onSubmit} />)

  const button = screen.getByRole('button', { name: 'Sign in' })
  expect(button).toBeDisabled()

  await user.type(screen.getByLabelText('Email'), 'ada@example.com')
  expect(button).toBeEnabled()

  await user.press(button)
  expect(onSubmit).toHaveBeenCalledWith('ada@example.com')
})
```

`toBeDisabled`, `toBeEnabled`, `toBeOnTheScreen` and Testing Library's other matchers are
registered for you; [Matchers](/guide/matchers) lists them and how to type them.
`await fireEvent.press(element)` calls the handler directly, without the press sequence. It is quicker
to write, and fine when a test only needs the handler to run.

## Wait for async work

A component that loads data renders once with what it has, then again when the data arrives. A
`getBy…` query right after `render` cannot see data that arrives later, after a timer or a network
response. `findBy…` retries until the element appears, for up to a second by default:

<!-- doc-snippet: src/Profile.tsx -->
```tsx
// Profile.tsx
import { useEffect, useState } from 'react'
import { Text } from 'react-native'

export function Profile({ loadName }: { loadName: () => Promise<string> }) {
  const [name, setName] = useState<string>()
  useEffect(() => {
    loadName().then(setName)
  }, [loadName])
  return <Text>{name ? `Hello, ${name}` : 'Loading…'}</Text>
}
```

<!-- doc-snippet: src/Profile.test.tsx -->
```tsx
// Profile.test.tsx
import { expect, it } from 'vitest'
import { render, screen } from '@testing-library/react-native'
import { Profile } from './Profile'

const loadName = () => new Promise<string>((resolve) => setTimeout(() => resolve('Ada'), 100))

it('shows the name once it loads', async () => {
  await render(<Profile loadName={loadName} />)
  expect(screen.getByText('Loading…')).toBeOnTheScreen()

  expect(await screen.findByText('Hello, Ada')).toBeOnTheScreen()
  expect(screen.queryByText('Loading…')).not.toBeOnTheScreen()
})
```

For a check that is not about one element appearing, wrap the assertion in `waitFor`:
`await waitFor(() => expect(onSave).toHaveBeenCalled())`. Passing the data in as a prop, as
`loadName` is here, keeps the test in control of it. For a module the component imports directly,
such as an API client, mock the module: see [Mocking](/guide/mocking).

## Control time

A component that waits on a timer, such as a toast that hides itself, would make the test wait
too. Fake timers let the test move the clock instead:

<!-- doc-snippet: src/Toast.tsx -->
```tsx
// Toast.tsx
import { useEffect, useState } from 'react'
import { Text } from 'react-native'

export function Toast({ message }: { message: string }) {
  const [visible, setVisible] = useState(true)
  useEffect(() => {
    const timer = setTimeout(() => setVisible(false), 3000)
    return () => clearTimeout(timer)
  }, [])
  return visible ? <Text>{message}</Text> : null
}
```

<!-- doc-snippet: src/Toast.test.tsx -->
```tsx
// Toast.test.tsx
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { act, render, screen } from '@testing-library/react-native'
import { Toast } from './Toast'

beforeEach(() => {
  vi.useFakeTimers()
})
afterEach(() => {
  vi.useRealTimers()
})

it('hides after three seconds', async () => {
  await render(<Toast message="Saved" />)
  expect(screen.getByText('Saved')).toBeOnTheScreen()

  await act(() => vi.advanceTimersByTime(3000))
  expect(screen.queryByText('Saved')).not.toBeOnTheScreen()
})
```

Advance the clock inside `act`, so React applies the updates the timers cause before the next
assertion.

Under the `native` engine, `findBy…`, `waitFor` and `userEvent` advance the fake clock themselves
while they wait, so they need no extra `advanceTimersByTime`. Here the loader's timer is fake too,
and `findBy…` still finds the name. For the `mock` engine, see
[Fake timers](/guide/mocking#fake-timers).

<!-- doc-snippet: src/fake-timers.test.tsx -->
```tsx
// fake-timers.test.tsx
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { render, screen, userEvent } from '@testing-library/react-native'
import { Profile } from './Profile'
import { SignInForm } from './SignInForm'

beforeEach(() => {
  vi.useFakeTimers()
})
afterEach(() => {
  vi.useRealTimers()
})

it('finds data that a fake timer loads', async () => {
  const loadName = () => new Promise<string>((resolve) => setTimeout(() => resolve('Ada'), 100))
  await render(<Profile loadName={loadName} />)

  expect(await screen.findByText('Hello, Ada')).toBeOnTheScreen()
})

it('types and presses with fake timers', async () => {
  const onSubmit = vi.fn()
  const user = userEvent.setup()
  await render(<SignInForm onSubmit={onSubmit} />)

  await user.type(screen.getByLabelText('Email'), 'ada@example.com')
  await user.press(screen.getByRole('button', { name: 'Sign in' }))
  expect(onSubmit).toHaveBeenCalledWith('ada@example.com')
})
```

## Between tests

Testing Library unmounts what a test rendered when the test ends, so each test starts from an
empty screen:

<!-- doc-snippet: src/between-tests.test.tsx -->
```tsx
// between-tests.test.tsx
import { useEffect } from 'react'
import { Text } from 'react-native'
import { expect, it } from 'vitest'
import { render, screen } from '@testing-library/react-native'

let unmounted = false

function Greeting() {
  useEffect(() => () => {
    unmounted = true
  }, [])
  return <Text>Hello</Text>
}

it('renders a greeting', async () => {
  await render(<Greeting />)
  expect(screen.getByText('Hello')).toBeOnTheScreen()
})

it('starts after the last test unmounted it', () => {
  expect(unmounted).toBe(true)
})
```

Vitest 5 clears mock calls before every test (`clearMocks: true`), so `toHaveBeenCalled` counts
only the current test's calls. A project set up with `vitest-native migrate` keeps Jest's default,
`clearMocks: false`, instead.

Other state carries over to the next test in the same file:

- A `vi.fn()`'s implementation or return value, set with `mockReturnValue` or
  `mockImplementation`. Clearing removes calls only; call `vi.resetAllMocks()` in `afterEach`, or
  set `mockReset: true`, to reset it.
- A `vi.spyOn` spy, which keeps replacing the real method. Call `vi.restoreAllMocks()` in
  `afterEach`, or set `restoreMocks: true`, to put the method back. Restoring does not reset a
  `vi.fn()`.
- Fake timers, until `vi.useRealTimers()`, as in the `afterEach` above.
- Screen size, color scheme and other device state set with the [test helpers](/guide/helpers).
  Call `resetAllMocks()` from `vitest-native/helpers` (not `vi.resetAllMocks()`) in `afterEach`,
  as the Quick Start does.
- Module-level variables, and the modules `vi.mock` replaced: they belong to the file, not the
  test.

## Next steps

- [Mocking](/guide/mocking): mock a module, a native module, or a timer.
- [Third-party presets](/guide/presets): Reanimated, Navigation and other libraries in tests.
- [Test helpers](/guide/helpers): screen size, color scheme and other device state.
- [Matchers & snapshots](/guide/matchers): every matcher, and snapshot testing.

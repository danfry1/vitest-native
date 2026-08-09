import { test, expect } from 'vitest'
import { render, screen } from '@testing-library/react-native'
import { GestureHandlerRootView, Gesture, GestureDetector } from 'react-native-gesture-handler'
import { Text } from 'react-native'
test('gesture handler composes and renders', async () => {
  const tap = Gesture.Tap().onEnd(() => {})
  await render(
    <GestureHandlerRootView><GestureDetector gesture={tap}><Text>tappable</Text></GestureDetector></GestureHandlerRootView>)
  expect(screen.getByText('tappable')).toBeTruthy()
})

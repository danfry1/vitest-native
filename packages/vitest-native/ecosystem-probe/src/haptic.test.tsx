import { test, expect } from 'vitest'
import ReactNativeHapticFeedback from 'react-native-haptic-feedback'
test('haptic feedback triggers', () => {
  expect(typeof ReactNativeHapticFeedback.trigger).toBe('function')
  ReactNativeHapticFeedback.trigger('impactLight')
})

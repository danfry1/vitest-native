import { test, expect } from 'vitest'
import { launchImageLibrary, launchCamera } from 'react-native-image-picker'
test('image-picker exposes its api', () => {
  expect(typeof launchImageLibrary).toBe('function')
  expect(typeof launchCamera).toBe('function')
})

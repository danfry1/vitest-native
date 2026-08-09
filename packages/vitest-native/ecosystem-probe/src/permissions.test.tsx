import { test, expect } from 'vitest'
import { check, PERMISSIONS, RESULTS } from 'react-native-permissions'
test('permissions exposes constants and check()', () => {
  expect(PERMISSIONS.IOS.CAMERA).toBeTruthy()
  expect(RESULTS.GRANTED).toBe('granted')
  expect(typeof check).toBe('function')
})

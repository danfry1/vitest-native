import { test, expect } from 'vitest'
import NetInfo from '@react-native-community/netinfo'
test('netinfo resolves a connection state', async () => {
  const state = await NetInfo.fetch()
  expect(state).toBeDefined()
  expect(typeof state.isConnected).toBe('boolean')
})

import { test, expect, vi, afterEach } from 'vitest'
import { render, screen, act } from '@testing-library/react-native'
import { useEffect, useState } from 'react'
import { Text } from 'react-native'
afterEach(() => vi.useRealTimers())
function Debounced() {
  const [v, setV] = useState('idle')
  useEffect(() => { const id = setTimeout(() => setV('fired'), 500); return () => clearTimeout(id) }, [])
  return <Text>{v}</Text>
}
test('fake timers advance a component timeout', async () => {
  vi.useFakeTimers()
  await render(<Debounced />)
  expect(screen.getByText('idle')).toBeTruthy()
  await act(async () => { vi.advanceTimersByTime(600) })
  expect(screen.getByText('fired')).toBeTruthy()
})

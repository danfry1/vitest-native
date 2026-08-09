import { test, expect } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react-native'
import AsyncStorage from '@react-native-async-storage/async-storage'
import { useEffect, useState } from 'react'
import { Text } from 'react-native'
function Persisted() {
  const [v, setV] = useState('...')
  useEffect(() => { (async () => { await AsyncStorage.setItem('k', 'stored'); setV((await AsyncStorage.getItem('k')) ?? 'none') })() }, [])
  return <Text>{v}</Text>
}
test('async-storage round-trips inside a component', async () => {
  await render(<Persisted />)
  await waitFor(() => expect(screen.getByText('stored')).toBeTruthy())
})

import { test, expect } from 'vitest'
import { render, screen } from '@testing-library/react-native'
import { FlashList } from '@shopify/flash-list'
import { Text } from 'react-native'
test('flash-list renders items', async () => {
  await render(<FlashList data={[{ id: 1, t: 'alpha' }, { id: 2, t: 'beta' }]}
    renderItem={({ item }) => <Text>{item.t}</Text>} estimatedItemSize={20} />)
  expect(screen.getByText('alpha')).toBeTruthy()
})

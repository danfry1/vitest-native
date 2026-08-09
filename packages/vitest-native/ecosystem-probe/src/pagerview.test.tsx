import { test, expect } from 'vitest'
import { render, screen } from '@testing-library/react-native'
import PagerView from 'react-native-pager-view'
import { View, Text } from 'react-native'
test('pager-view renders pages', async () => {
  await render(<PagerView testID="p" initialPage={0}><View key="1"><Text>one</Text></View></PagerView>)
  expect(screen.getByText('one')).toBeTruthy()
})

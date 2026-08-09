import { test, expect } from 'vitest'
import { render, screen } from '@testing-library/react-native'
import LinearGradient from 'react-native-linear-gradient'
import { Text } from 'react-native'
test('linear-gradient renders children', async () => {
  await render(<LinearGradient testID="g" colors={['#000', '#fff']}><Text>hi</Text></LinearGradient>)
  expect(screen.getByText('hi')).toBeTruthy()
})

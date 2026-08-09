import { test, expect } from 'vitest'
import { render, screen } from '@testing-library/react-native'
import Slider from '@react-native-community/slider'
test('slider renders', async () => {
  await render(<Slider testID="s" value={0.5} />)
  expect(screen.getByTestId('s')).toBeTruthy()
})

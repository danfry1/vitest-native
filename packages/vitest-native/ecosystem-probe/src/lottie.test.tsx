import { test, expect } from 'vitest'
import { render, screen } from '@testing-library/react-native'
import LottieView from 'lottie-react-native'
test('lottie renders', async () => {
  await render(<LottieView testID="l" source={{}} autoPlay loop />)
  expect(screen.getByTestId('l')).toBeTruthy()
})

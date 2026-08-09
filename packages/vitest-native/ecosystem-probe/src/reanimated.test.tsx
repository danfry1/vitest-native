import { test, expect } from 'vitest'
import { render, screen } from '@testing-library/react-native'
import Animated, { useSharedValue, useAnimatedStyle, withTiming, FadeIn } from 'react-native-reanimated'
import { Text } from 'react-native'
function Fading() {
  const o = useSharedValue(0)
  const style = useAnimatedStyle(() => ({ opacity: o.value }))
  return <Animated.View testID="fade" style={style} entering={FadeIn}><Text>faded</Text></Animated.View>
}
test('reanimated renders an animated component', async () => {
  await render(<Fading />)
  expect(screen.getByTestId('fade')).toBeTruthy()
  expect(screen.getByText('faded')).toBeTruthy()
  expect(typeof withTiming).toBe('function')
})

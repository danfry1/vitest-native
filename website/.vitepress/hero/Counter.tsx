import { useState } from 'react'
import { Pressable, Text } from 'react-native'

export function Counter() {
  const [count, setCount] = useState(0)
  return (
    <Pressable accessibilityRole="button" onPress={() => setCount(count + 1)}>
      <Text>Count: {count}</Text>
    </Pressable>
  )
}

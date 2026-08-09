import { test, expect } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react-native'
import { NavigationContainer } from '@react-navigation/native'
import { createNativeStackNavigator } from '@react-navigation/native-stack'
import { Text, Pressable } from 'react-native'
const Stack = createNativeStackNavigator()
function Home({ navigation }: any) {
  return <Pressable onPress={() => navigation.navigate('Details')}><Text>go</Text></Pressable>
}
function Details() { return <Text>details screen</Text> }
test('navigates between screens', async () => {
  await render(
    <NavigationContainer>
      <Stack.Navigator><Stack.Screen name="Home" component={Home} /><Stack.Screen name="Details" component={Details} /></Stack.Navigator>
    </NavigationContainer>)
  await fireEvent.press(screen.getByText('go'))
  expect(screen.getByText('details screen')).toBeTruthy()
})

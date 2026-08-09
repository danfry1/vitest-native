import { test, expect } from 'vitest'
import { render, screen } from '@testing-library/react-native'
import DateTimePicker from '@react-native-community/datetimepicker'
test('datetimepicker renders', async () => {
  await render(<DateTimePicker testID="d" value={new Date(0)} mode="date" />)
  expect(screen.getByTestId('d')).toBeTruthy()
})

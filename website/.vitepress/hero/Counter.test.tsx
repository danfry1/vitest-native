import { beforeEach, expect, it } from 'vitest'
import { fireEvent, render, screen } from '@testing-library/react-native'
import { Counter } from './Counter'

beforeEach(async () => { await render(<Counter />) })
it('is a button', () => {
  expect(screen.getByRole('button')).toBeOnTheScreen()
})
it('starts at zero', () => {
  expect(screen.getByText('Count: 0')).toBeOnTheScreen()
})
it('counts a press', async () => {
  await fireEvent.press(screen.getByRole('button'))
  expect(screen.getByText('Count: 1')).toBeOnTheScreen()
})

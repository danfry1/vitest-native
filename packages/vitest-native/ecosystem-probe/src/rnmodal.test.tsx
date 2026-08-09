import { test, expect } from 'vitest'
import { render, screen } from '@testing-library/react-native'
import Modal from 'react-native-modal'
import { Text } from 'react-native'
// The regression this file exists for: the untranspiled JSX is in
// react-native-animatable, a transitive dependency that declares react-native
// nowhere, so detection could not see it and the import died on a bare
// `SyntaxError: Unexpected token '<'`.
test('react-native-modal renders when visible', async () => {
  await render(<Modal isVisible><Text>inside</Text></Modal>)
  expect(screen.getByText('inside')).toBeTruthy()
})

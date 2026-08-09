import { test, expect } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react-native'
import { QueryClient, QueryClientProvider, useQuery } from '@tanstack/react-query'
import { Text } from 'react-native'
function User() {
  const { data, isLoading } = useQuery({ queryKey: ['u'], queryFn: async () => ({ name: 'Ada' }) })
  return <Text>{isLoading ? 'loading' : data!.name}</Text>
}
test('react-query resolves into a component', async () => {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  await render(<QueryClientProvider client={client}><User /></QueryClientProvider>)
  await waitFor(() => expect(screen.getByText('Ada')).toBeTruthy())
})

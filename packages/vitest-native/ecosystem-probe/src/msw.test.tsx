import { test, expect, beforeAll, afterAll } from 'vitest'
import { setupServer } from 'msw/node'
import { http, HttpResponse } from 'msw'
const server = setupServer(http.get('https://api.test/user', () => HttpResponse.json({ name: 'Ada' })))
beforeAll(() => server.listen({ onUnhandledRequest: 'error' }))
afterAll(() => server.close())
test('msw intercepts fetch under the native engine', async () => {
  const res = await fetch('https://api.test/user')
  expect(await res.json()).toEqual({ name: 'Ada' })
})

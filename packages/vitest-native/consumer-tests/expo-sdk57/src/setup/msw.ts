// A project setup file that starts an MSW server, as suites that mock the network
// do. expo-fetch.test.tsx and no-expo-fetch.test.tsx check that Expo leaves it working.
import { http, HttpResponse } from "msw";
import { setupServer } from "msw/node";
import { afterAll, beforeAll } from "vitest";

const server = setupServer(
  http.get("https://api.example.test/greeting", () => HttpResponse.json({ hello: "msw" })),
);
beforeAll(() => server.listen({ onUnhandledRequest: "bypass" }));
afterAll(() => server.close());

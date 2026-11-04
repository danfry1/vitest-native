// A project setup file that starts an MSW server, as suites that mock the network do.
// It initialises Node's fetch before any test runs.
import { http, HttpResponse } from "msw";
import { setupServer } from "msw/node";
import { afterAll, beforeAll } from "vitest";

const server = setupServer(
  http.get("https://api.example.test/greeting", () => HttpResponse.json({ hello: "msw" })),
);
beforeAll(() => server.listen({ onUnhandledRequest: "bypass" }));
afterAll(() => server.close());

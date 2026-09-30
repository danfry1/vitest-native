import { mockFn } from "../mock-fn.js";

export function createAlertMock() {
  return {
    alert: mockFn(),
    prompt: mockFn(),
  };
}

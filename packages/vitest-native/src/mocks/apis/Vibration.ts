import { mockFn } from "../mock-fn.js";

export function createVibrationMock() {
  return {
    vibrate: mockFn(),
    cancel: mockFn(),
  };
}

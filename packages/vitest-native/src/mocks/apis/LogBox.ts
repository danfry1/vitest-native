import { mockFn } from "../mock-fn.js";

export function createLogBoxMock() {
  return {
    ignoreLogs: mockFn(),
    ignoreAllLogs: mockFn(),
    uninstall: mockFn(),
    install: mockFn(),
  };
}

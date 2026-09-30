import { mockFn } from "../mock-fn.js";

export function createActionSheetIOSMock() {
  return {
    showActionSheetWithOptions: mockFn(),
    showShareActionSheetWithOptions: mockFn(),
  };
}

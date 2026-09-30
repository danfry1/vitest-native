import { vi } from "vitest";
import { mockFn } from "../mock-fn.js";

export function createUIManagerMock() {
  return {
    measure: vi.fn((_node: number, callback: Function) => {
      callback(0, 0, 0, 0, 0, 0);
    }),
    measureInWindow: vi.fn((_node: number, callback: Function) => {
      callback(0, 0, 0, 0);
    }),
    measureLayout: vi.fn(
      (_node: number, _relativeNode: number, _onFail: Function, onSuccess: Function) => {
        onSuccess(0, 0, 0, 0);
      },
    ),
    setChildren: mockFn(),
    manageChildren: mockFn(),
    createView: mockFn(),
    updateView: mockFn(),
    removeSubviewsFromContainerWithID: mockFn(),
    replaceExistingNonRootView: mockFn(),
    setLayoutAnimationEnabledExperimental: mockFn(),
    configureNextLayoutAnimation: mockFn(),
    getViewManagerConfig: vi.fn((_name: string) => ({})),
    hasViewManagerConfig: vi.fn((_name: string) => false),
    dispatchViewManagerCommand: mockFn(),
    findSubviewIn: mockFn(),
    viewIsDescendantOf: mockFn(),
  };
}

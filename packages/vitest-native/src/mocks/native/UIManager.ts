import { vi } from "vitest";

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
    setChildren: vi.fn(),
    manageChildren: vi.fn(),
    createView: vi.fn(),
    updateView: vi.fn(),
    removeSubviewsFromContainerWithID: vi.fn(),
    replaceExistingNonRootView: vi.fn(),
    setLayoutAnimationEnabledExperimental: vi.fn(),
    configureNextLayoutAnimation: vi.fn(),
    getViewManagerConfig: vi.fn((_name: string) => ({})),
    hasViewManagerConfig: vi.fn((_name: string) => false),
    dispatchViewManagerCommand: vi.fn(),
    findSubviewIn: vi.fn(),
    viewIsDescendantOf: vi.fn(),
  };
}

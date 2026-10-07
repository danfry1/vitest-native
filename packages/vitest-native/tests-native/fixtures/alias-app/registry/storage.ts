// The app's storage module. Tests mock it; a module that reaches it through Node
// (require, jest.requireActual) must see that mock too.
export const device = {
  get: (key: string): string => `real-storage:${key}`,
};

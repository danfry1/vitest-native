// A manual mock beside the module it mocks, applied by jest.mock('../services/analytics').
export const track = jest.fn((event: string) => `mocked ${event}`);

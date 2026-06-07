// Fixture for the jest.mock-hoisting integration test. The real impl returns
// "real-hello"; the test mocks it to "mocked-hello" via a top-level jest.mock.
export const greet = () => "real-hello";

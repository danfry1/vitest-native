// Fixture for jest-compat-semantics.test.tsx: a class the test replaces with
// `jest.fn().mockImplementation(() => ({ ... }))`.
export class FeedApi {
  fetch() {
    return "real-feed";
  }
}

// vitest-native/jest-compat/extend-expect-noop
//
// Alias `@testing-library/jest-native/extend-expect` to this. jest-native's
// matchers are already registered by vitest-native's setup (it extends expect
// with the RNTL built-in matchers), so importing the jest-native extend-expect
// entry just needs to be a harmless no-op rather than pulling in jest internals.
export default {};

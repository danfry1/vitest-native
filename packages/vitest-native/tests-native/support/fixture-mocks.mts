// Suites rooted at the package crawl every __mocks__ folder under it, as Jest's haste map
// would, so the manual mocks of the fixture apps below would apply to them too. Jest's
// answer is modulePathIgnorePatterns; these suites pass it.
export const OTHER_FIXTURES_MOCKS = {
  modulePathIgnorePatterns: [
    String.raw`[\\/]tests-native[\\/]root-mocks`,
    String.raw`[\\/]tests-native[\\/]node-mocks[\\/]__mocks__[\\/]`,
  ],
};

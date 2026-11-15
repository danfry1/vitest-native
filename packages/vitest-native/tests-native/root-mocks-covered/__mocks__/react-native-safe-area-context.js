// The safe-area-context preset stands in for this package, so this mock is left alone. It is
// the project's only manual mock: the generated root-mocks module then registers nothing of
// its own (#732).
module.exports = { useSafeAreaInsets: () => ({ top: -1, right: -1, bottom: -1, left: -1 }) };

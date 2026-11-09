// A manual mock kept from Jest. The safe-area-context preset stands in for the package, so
// it is not applied, and it is the app's only one.
module.exports = { useSafeAreaInsets: () => ({ top: -1, right: -1, bottom: -1, left: -1 }) };

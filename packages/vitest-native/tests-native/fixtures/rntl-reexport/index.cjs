// A shared test-utils module that re-exports React Native Testing Library, loaded
// through Node's require (tests-native/no-globals/04-reexport.test.tsx), so RNTL's
// entry is reached without passing through Vite's module evaluator.
module.exports = require("@testing-library/react-native");

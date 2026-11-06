// The package's own test mock, which builds on the real module by a relative import of
// its entry, as react-native-reanimated/mock does.
const real = require("./index");
module.exports = { ...real, mocked: true };

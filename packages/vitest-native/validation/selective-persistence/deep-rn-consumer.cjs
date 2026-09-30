const root = require("react-native");
const platformModule = require("react-native/Libraries/Utilities/Platform");

module.exports = {
  root,
  platform: platformModule.default ?? platformModule,
};

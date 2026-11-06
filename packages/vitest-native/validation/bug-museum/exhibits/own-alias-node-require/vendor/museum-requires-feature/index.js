// An installed React Native package (so Node owns it) that requires the workspace library by name.
exports.viaNode = () => require("@m/feature").readStore();

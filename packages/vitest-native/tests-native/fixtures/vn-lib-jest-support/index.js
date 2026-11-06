// A library shaped like the React Native ones that ship Jest support: its JS calls into
// a native module that only exists on a device.
const NativeThing = require("./NativeThing");
exports.read = () => NativeThing.read();
exports.count = () => NativeThing.count();

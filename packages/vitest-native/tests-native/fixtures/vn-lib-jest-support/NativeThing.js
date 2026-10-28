module.exports = {
  read() {
    throw new Error("NativeThing is a native module");
  },
  count() {
    throw new Error("NativeThing is a native module");
  },
};

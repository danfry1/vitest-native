// The CommonJS build. zustand and much of the React Native ecosystem point their
// "react-native" export condition at exactly this shape, because Metro consumes CJS.
exports.entry = "cjs";
exports.create = function create(initializer) {
  const state = initializer();
  return { getState: () => state };
};

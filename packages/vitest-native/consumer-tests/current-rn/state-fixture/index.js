// A CommonJS node_modules package holding module-level state, imported by test
// files through ESM. The hot runtime must hand every file a fresh instance
// (tests-native/hot-isolation covers this in-repo; this copy proves it from a
// packed install, where the ESM generation stamp actually applies to the package).
const entries = [];
exports.record = (value) => {
  entries.push(value);
};
exports.count = () => entries.length;

// A CommonJS project file with module state.
let calls = 0;
module.exports = function legacy() {
  calls += 1;
  return `legacy:${calls}`;
};

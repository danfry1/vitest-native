// An installed package that Node loads (it is not inlined), which requires or imports
// whatever it is asked for: what an installed package's own require reaches, through
// each of Node's loaders (tests-native/node-dispatch-precedence.test.ts).
exports.requireFrom = (request) => require(request);
exports.importFrom = (request) => import(request);

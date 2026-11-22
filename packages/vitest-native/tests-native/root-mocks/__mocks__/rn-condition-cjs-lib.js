// A root mock of a package the tests only require(), never import (#566 review): Node's
// require must get it too.
module.exports = { source: "the manual mock, through require" };

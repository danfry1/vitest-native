// Required from fp-app, where Node finds vn-fp-probe in fp-app/node_modules: the link
// to the workspace source, not the copy installed at the package root.
module.exports = () => require("vn-fp-probe").state.value;

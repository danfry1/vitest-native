// Simulates a library that publishes untranspiled JSX — common in the RN
// ecosystem, where packages assume Metro will compile them. Node cannot parse
// this file; requiring it without adding the package to `transform: [...]`
// must produce the explained error (see explain-untransformed.test.ts).
module.exports = function Badge() {
  return <text>badge</text>;
};

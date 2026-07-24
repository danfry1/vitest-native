// The web/Node build. Loading this in a React Native test means testing the wrong
// code — which is what happened before the ssr resolve condition was set.
module.exports = { entry: "default" };

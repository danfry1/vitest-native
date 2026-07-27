// The compiled build, committed on purpose: `dist/` is gitignored repo-wide, so a
// build output placed there vanishes from a fresh checkout and the package cannot
// resolve its own entry. CI caught exactly that.
// The compiled build. Deliberately DIFFERENT module state from src/index.js: if the
// two module systems disagree about which file this package is, the app configures
// one copy and renders the other.
const React = require("react");
const { Text } = require("react-native");
const store = { translator: undefined };
exports.configureTranslator = (fn) => { store.translator = fn; };
exports.translate = (key) => (store.translator ? store.translator(key) : "");
exports.Label = ({ id }) => React.createElement(Text, { testID: "label" }, exports.translate(id));

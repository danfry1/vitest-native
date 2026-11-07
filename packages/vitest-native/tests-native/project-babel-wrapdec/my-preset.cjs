// An app preset wrapping React Native's and adding legacy decorators: only decorator
// files compile with Babel, and React Native's own module transform, which this preset
// does not turn off, must not make them CommonJS. It also sets the JSX transform's
// `importSource` (React's own default, so nothing changes at run time): React Native's
// preset adds that plugin without it, so the options differ on every version and files
// with JSX route. (Class properties are not a reliable case for that: React Native
// 0.86's preset adds them loose itself, 0.88's keeps class fields for Hermes.)
const via = (spec, from) => require.resolve(spec, { paths: [from] });
const presetExpo = via("babel-preset-expo/package.json", require.resolve("expo/package.json"));
const presetRN = require.resolve("@react-native/babel-preset");
module.exports = () => ({
  presets: [presetRN],
  plugins: [
    [via("@babel/plugin-proposal-decorators", presetExpo), { legacy: true }],
    [via("@babel/plugin-transform-class-properties", presetRN), { loose: true }],
    [via("@babel/plugin-transform-react-jsx", presetRN), { runtime: "automatic", importSource: "react" }],
  ],
});

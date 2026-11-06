// An app preset wrapping React Native's and adding legacy decorators: only decorator
// files compile with Babel, and React Native's own module transform, which this preset
// does not turn off, must not make them CommonJS.
const via = (spec, from) => require.resolve(spec, { paths: [from] });
const presetExpo = via("babel-preset-expo/package.json", require.resolve("expo/package.json"));
const presetRN = require.resolve("@react-native/babel-preset");
module.exports = () => ({
  presets: [presetRN],
  plugins: [
    [via("@babel/plugin-proposal-decorators", presetExpo), { legacy: true }],
    [via("@babel/plugin-transform-class-properties", presetRN), { loose: true }],
  ],
});

// A project Babel config that projectBabel acts on (legacy decorators, as a WatermelonDB
// app's), so its load hook sees every source id under this root, virtual ones included.
const via = (spec, from) => require.resolve(spec, { paths: [from] });
const presetExpo = via("babel-preset-expo/package.json", require.resolve("expo/package.json"));
const presetRN = require.resolve("@react-native/babel-preset");

module.exports = {
  presets: ["module:@react-native/babel-preset"],
  plugins: [
    [via("@babel/plugin-proposal-decorators", presetExpo), { legacy: true }],
    [via("@babel/plugin-transform-class-properties", presetRN), { loose: true }],
  ],
};

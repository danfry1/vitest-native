// An app's own preset that wraps React Native's without passing options on, as some do
// (or @rnx-kit/babel-preset-metro-react-native): projectBabel expands it, finds nothing
// beyond React Native's preset, and leaves the project on Oxc.
module.exports = () => ({ presets: [require.resolve("@react-native/babel-preset")] });

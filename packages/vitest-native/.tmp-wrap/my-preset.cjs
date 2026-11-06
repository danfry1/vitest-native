// Wraps React Native's preset without forwarding options, as some apps' presets do.
module.exports = (api) => ({ presets: [require.resolve("@react-native/babel-preset", { paths: [process.cwd()] })] });

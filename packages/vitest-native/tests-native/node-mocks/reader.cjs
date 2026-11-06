// A project module that requires another project file, as Bluesky's appState.ts requires #/env.
exports.read = () => require("./local-thing").local;

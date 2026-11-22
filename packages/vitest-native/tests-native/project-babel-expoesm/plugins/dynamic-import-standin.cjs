// Stands in for @babel/plugin-transform-dynamic-import, which this package does not
// install: the same name, and the same refusal without a module transform. Bluesky lists
// the real one; projectBabel keeps ES modules, so it must take the plugin out.
module.exports = () => ({
  name: "transform-dynamic-import",
  visitor: {
    Program(_path, state) {
      if (!state.file.get("@babel/plugin-transform-modules-*")) {
        throw new Error(
          "@babel/plugin-transform-dynamic-import depends on a modules transform plugin.",
        );
      }
    },
  },
});

// An app preset adding two plugins vitest-native does not know: one that writes CommonJS,
// and one that rewrites __LABEL__ to "RIGHT". The file needs the second, so falling back
// to Oxc would quietly drop it: the run fails by name instead.
module.exports = () => ({
  presets: [require.resolve("@react-native/babel-preset")],
  plugins: [
    ({ types: t }) => ({
      name: "inline-label",
      visitor: {
        Identifier(path) {
          if (path.node.name === "__LABEL__") path.replaceWith(t.stringLiteral("RIGHT"));
        },
      },
    }),
    () => ({
      name: "custom-commonjs",
      visitor: {
        Program: {
          exit(program) {
            program.node.body.unshift(
              ...require("@babel/core").template.statements.ast(
                'Object.defineProperty(exports, "__esModule", { value: true });',
              ),
            );
          },
        },
      },
    }),
  ],
});

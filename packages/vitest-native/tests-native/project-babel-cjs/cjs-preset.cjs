// An app preset that adds a custom plugin writing CommonJS, which vitest-native does not
// know how to take out: projectBabel falls back to Oxc for the files it alone applies to,
// and warns once naming it.
module.exports = () => ({
  presets: [require.resolve("@react-native/babel-preset")],
  plugins: [
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

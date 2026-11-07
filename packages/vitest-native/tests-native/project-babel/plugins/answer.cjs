// A project's own plugin: replaces the identifier __ANSWER__ with 42.
module.exports = ({ types: t }) => ({
  name: "answer",
  visitor: {
    Identifier(path) {
      if (path.node.name === "__ANSWER__") path.replaceWith(t.numericLiteral(42));
    },
  },
});

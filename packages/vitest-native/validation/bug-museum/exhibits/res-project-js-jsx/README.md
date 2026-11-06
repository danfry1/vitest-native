# JSX in a project's own .js files does not compile

- **Class:** transform/resolution
- **Source:** react-native-paper and Rocket.Chat trials (#561)
- **Fixed by:** #564 (merged)
- **Needs:** nothing beyond this repository's install

## The bug

Vite compiles `.js` files without JSX, so a project `.js` file with JSX, which Metro and babel-jest accept, failed with "Failed to parse source for import analysis". In both apps the Jest setup file was one, so every suite failed.

## Expected behaviour

A project's `.js` files compile with JSX, and the component renders.

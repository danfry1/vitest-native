# A package with JSX in a .js file that declares no react-native fails to load

- **Class:** transform/resolution
- **Source:** #763 (react-native-calendars 1.1314.0)
- **Fixed by:** open
- **Needs:** nothing beyond this repository's install

## The bug

The native engine compiles the React Native packages it detects, and detects a package by its `react-native` dependency or peer. A library that declares neither, such as react-native-calendars (`main` is `src/index.ts`), is served by Vite. Vite's Oxc transform compiles its `.ts` files but skips `.js`, so JSX in a `.js` file failed Vite's import analysis: "Failed to parse source for import analysis because the content contains invalid JS syntax", before any test ran.

## Expected behaviour

The component renders with no configuration, as it does under Jest, whose babel-jest compiles every `.js` file with JSX enabled.

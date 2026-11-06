// A .js setup file with JSX, as React Native projects write them for Jest (a
// jest.setup.js rendering a provider). Metro and babel-jest compile JSX in .js; Vite's
// Oxc transform skips .js unless the plugin compiles it.
import { Text } from "react-native";

globalThis.__setupElement = <Text testID="from-setup">set up</Text>;

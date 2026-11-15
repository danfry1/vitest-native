// The shape of a React Native library the native engine does not detect (#763): no
// `react-native` dependency or peer, ES module syntax and JSX in a `.js` file, as
// react-native-calendars publishes `src/calendar/index.js`. Vite serves it uncompiled.
import { Text } from "react-native";
import { plain } from "./plain.js";

export const Label = ({ children }) => <Text testID="label">{children}</Text>;
export const marker = "__PACKAGE_TRANSFORM__";
export { plain };

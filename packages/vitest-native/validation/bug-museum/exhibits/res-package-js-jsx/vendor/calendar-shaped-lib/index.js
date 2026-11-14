// No react-native dependency or peer, and JSX in a .js file, as react-native-calendars
// publishes src/calendar/index.js.
import { Text } from "react-native";

export const Month = ({ title }) => <Text testID="month">{title}</Text>;

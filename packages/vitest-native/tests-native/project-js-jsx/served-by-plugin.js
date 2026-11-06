// On disk this file has JSX, but the config's own `project-load` plugin serves it, and
// what that plugin returns is what runs.
import { Text } from "react-native";

export const element = <Text>from disk</Text>;
export const servedBy = "disk";

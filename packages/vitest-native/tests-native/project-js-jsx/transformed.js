// The config's own `project-transform` plugin replaces the marker below; the JSX is
// compiled first, as Vite compiles a .jsx file before a project's transform sees it.
import { Text } from "react-native";

export const element = <Text>transformed</Text>;
export const marker = "__PROJECT_TRANSFORM__";
